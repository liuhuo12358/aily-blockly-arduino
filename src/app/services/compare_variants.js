const fs = require('fs');
const path = require('path');

function extractParams(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const params = {};
    // 解析整个文件以捕获所有 #define（包含 SPI / WIRE 等定义）
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        // 更宽松的 #define 匹配，捕获值并去除注释和括号
        const m = /^\s*#\s*define\s+(\w+)\s+(.+?)(?:\s*(?:\/\/|\/\*).*)?$/.exec(line);
        if (m) {
            let val = m[2].trim();
            // 去掉括号或尾随逗号等
            val = val.replace(/^\(+/, '').replace(/\)+$/, '').replace(/,+$/, '').trim();
            params[m[1]] = val;
        }
    }
    // 构建 SPI 和 WIRE 统一表示，便于比较
    const spiKeys = Object.keys(params).filter(k => k.startsWith('PIN_SPI_'));
    const spiMap = { MOSI: '', MISO: '', SCK: '', SS: '' };
    // 首选 PIN_SPI_SS，然后 PIN_SPI_SS1/SS2/SS3 等
    if (params['PIN_SPI_SS']) spiMap.SS = params['PIN_SPI_SS'];
    else {
        for (const k of ['PIN_SPI_SS1','PIN_SPI_SS2','PIN_SPI_SS3','PIN_SPI_SS0']) {
            if (params[k]) { spiMap.SS = params[k]; break; }
        }
    }
    if (params['PIN_SPI_MOSI']) spiMap.MOSI = params['PIN_SPI_MOSI'];
    if (params['PIN_SPI_MISO']) spiMap.MISO = params['PIN_SPI_MISO'];
    if (params['PIN_SPI_SCK']) spiMap.SCK = params['PIN_SPI_SCK'];
    // 如果有 indexed SS definitions like PIN_SPI_SS3, ensure captured above.

    const wireMap = { SDA: '', SCL: '' };
    if (params['PIN_WIRE_SDA']) wireMap.SDA = params['PIN_WIRE_SDA'];
    if (params['PIN_WIRE_SCL']) wireMap.SCL = params['PIN_WIRE_SCL'];

    // 只保留指定参数（把 SPI/WIRE 用对象表示，比较时逐字段检查）
    const keysToKeep = [
        'NUM_DIGITAL_PINS',
        'NUM_ANALOG_INPUTS'
    ];
    const filtered = {};
    for (const k of keysToKeep) {
        if (params[k] !== undefined) filtered[k] = params[k];
    }
    // 添加统一的 SPI 和 WIRE 对象
    filtered['SPI'] = { MOSI: spiMap.MOSI || '', MISO: spiMap.MISO || '', SCK: spiMap.SCK || '', SS: spiMap.SS || '' };
    filtered['WIRE'] = { SDA: wireMap.SDA || '', SCL: wireMap.SCL || '' };
    // 保留原始解析的 params 以便调试
    filtered['_raw'] = params;

    return filtered;
}

function walkDir(dir, callback) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            walkDir(fullPath, callback);
        } else if (dirent.isFile() && dirent.name === 'variant_generic.h') {
            callback(fullPath);
        }
    });
}

function groupByFifthChar(files) {
    const groups = {};
    files.forEach(({ folder, params }) => {
        if (folder.length < 5) return;
        const key = folder[4];
        if (!groups[key]) groups[key] = [];
        groups[key].push({ folder, params });
    });
    return groups;
}

function compareParams(group) {
    if (group.length < 2) return [];
    const keys = Array.from(new Set(group.flatMap(item => Object.keys(item.params))));
    const diffs = [];
    for (const key of keys) {
        if (key === '_raw') continue; // 不直接比较 raw
        if (key === 'SPI' || key === 'WIRE') {
            // 对象逐字段比较
            const subKeys = key === 'SPI' ? ['MOSI','MISO','SCK','SS'] : ['SDA','SCL'];
            const perSub = [];
            for (const sub of subKeys) {
                const vals = group.map(item => (item.params[key] && item.params[key][sub]) ? item.params[key][sub] : '');
                const uniq = Array.from(new Set(vals));
                if (uniq.length > 1) {
                    perSub.push({ sub, values: group.map((item, idx) => ({ folder: item.folder, value: vals[idx] })) });
                }
            }
            if (perSub.length > 0) {
                // also include raw params for context
                diffs.push({ param: key, subDiffs: perSub, raw: group.map(item => ({ folder: item.folder, raw: item.params['_raw'] || {} })) });
            }
        } else {
            const values = group.map(item => item.params[key] || '');
            const unique = Array.from(new Set(values));
            if (unique.length > 1) {
                diffs.push({ param: key, values: group.map(item => ({ folder: item.folder, value: item.params[key] || '' })) });
            }
        }
    }
    return diffs;
}

function main(rootDir) {
    const all = [];
    walkDir(rootDir, (hPath) => {
        const folder = path.basename(path.dirname(hPath));
        const params = extractParams(hPath);
        all.push({ folder, params });
    });

    const groups = groupByFifthChar(all);
    let hasDiff = false;
    let log = '';
    const groupCount = Object.keys(groups).length;
    log += `共对比分组数: ${groupCount}\n`;
    log += '分组字符及包含文件夹如下：\n';
    for (const [key, group] of Object.entries(groups)) {
        log += `  分组字符: ${key}  文件夹: ${group.map(g=>g.folder).join(', ')}\n`;
    }
    for (const [key, group] of Object.entries(groups)) {
        const diffs = compareParams(group);
        if (diffs.length > 0) {
            hasDiff = true;
            log += `分组[第5字符=${key}] 下的文件夹参数不一致:\n`;
            for (const diff of diffs) {
                log += `  参数: ${diff.param}\n`;
                if (diff.param === 'SPI' || diff.param === 'WIRE') {
                    // 子字段差异
                    for (const sd of diff.subDiffs) {
                        log += `    子字段: ${sd.sub}\n`;
                        sd.values.forEach(v => {
                            log += `      文件夹: ${v.folder}  值: ${v.value}\n`;
                        });
                    }
                    // // 原始解析对照
                    // log += '    原始 params: \n';
                    // diff.raw.forEach(r => {
                    //     log += `      文件夹: ${r.folder}\n`;
                    //     // 打印部分关键原始字段（SPI/WIRE 和 SPI_* / PIN_WIRE_*）
                    //     const raw = r.raw || {};
                    //     const interesting = Object.keys(raw).filter(k => k.startsWith('PIN_SPI_') || k.startsWith('PIN_WIRE_'));
                    //     interesting.forEach(k => {
                    //         log += `        ${k}: ${raw[k]}\n`;
                    //     });
                    // });
                } else {
                    diff.values.forEach(v => {
                        log += `    文件夹: ${v.folder}  值: ${v.value}\n`;
                    });
                }
            }
        }
    }
    if (!hasDiff) {
        log += '所有分组参数完全一致。\n';
    }
    const logPath = path.join(rootDir, 'compare_variants.log');
    fs.writeFileSync(logPath, log, 'utf-8');
    console.log('对比结果已输出到: ' + logPath);
}

main(process.argv[2]);