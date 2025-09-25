const fs = require('fs');
const path = require('path');

function parseVariantH(filePath) {
    const analogPins = [];
    const digitalPins = [];
    const i2cPins = { Wire: [] };
    const spiPins = { SPI: [] };
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);

    // 更宽松的匹配：允许行首空白、# 后可有空格，兼容多空格和缩进
    const analogRe = /^\s*#\s*define\s+([A-Z]{2}\d{1,2})\s+(PIN_A\d+)\b/;
    const digitalRe = /^\s*#\s*define\s+([A-Z]{2}\d{1,2})\s+(\d+|PIN_A\d+)\b/;
    const i2cRe = /^\s*#\s*define\s+PIN_WIRE_(SDA|SCL)\s+([A-Z]{1,2}\d{1,2})\b/;
    const spiRe = /^\s*#\s*define\s+PIN_SPI_(SS\d*|MOSI|MISO|SCK)\s+([A-Z]{1,2}\d{1,2})\b/;

    const digitalSet = new Set();
    const spiMap = {};
    const i2cMap = {};

    for (const line of lines) {
        const m = analogRe.exec(line);
        if (m) {
            // analog: ["PIN_A0","PA0"] 或者根据你需要调整为 ["A0","PA0"]
            analogPins.push([m[2], m[1]]);
        }
        const m2 = digitalRe.exec(line);
        if (m2) {
            if (!digitalSet.has(m2[1])) {
                digitalSet.add(m2[1]);
                digitalPins.push([m2[1], m2[1]]);
            }
        }
        const m3 = i2cRe.exec(line);
        if (m3) {
            // 收集到 map，最后保证顺序为 SDA, SCL
            i2cMap[m3[1]] = m3[2];
        }
        const m4 = spiRe.exec(line);
        if (m4) {
            // 将 SS、SS1、SS2 等统一为 SS
            let key = m4[1];
            if (key.startsWith('SS')) key = 'SS';
            spiMap[key] = m4[2];
        }
    }

    // 按需生成 i2cPins.Wire，顺序 SDA then SCL（如果存在）
    if (i2cMap['SDA']) i2cPins.Wire.push(['SDA', i2cMap['SDA']]);
    if (i2cMap['SCL']) i2cPins.Wire.push(['SCL', i2cMap['SCL']]);

    // 按固定顺序输出 SPI：MOSI, MISO, SCK, SS
    const spiOrder = ['MOSI', 'MISO', 'SCK', 'SS'];
    for (const k of spiOrder) {
        if (spiMap[k]) spiPins.SPI.push([k, spiMap[k]]);
    }

    return { analogPins, digitalPins, i2cPins, spiPins };
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

function main(rootDir) {
    walkDir(rootDir, (hPath) => {
        const { analogPins, digitalPins, i2cPins, spiPins } = parseVariantH(hPath);
        const result = {
            analogPins,
            digitalPins,
            pwmPins: digitalPins,
            servoPins: digitalPins,
            interruptPins: digitalPins,
            i2cPins,
            spiPins
        };
        const folderName = path.basename(path.dirname(hPath));
        const outPath = path.join(path.dirname(hPath), `${folderName}.boards.json`);
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log('生成:', outPath);
    });
}

// 用法: node gen_boards.js "C:\\your\\path\\STM32F1xx"
main(process.argv[2]);