
export async function getDefaultBuildPath(sketchFilePath: string): Promise<string> {
    console.log("sketchFilePath: ", sketchFilePath);
    const sketchMd5Value = await window["tools"].calculateMD5(window['path'].dirname(window['path'].resolve(sketchFilePath)));
    const sketchMd5 = sketchMd5Value.slice(0, 8);
    const sketchName = window['path'].basename(sketchFilePath, '.ino');
    return `${window['path'].getAilyBuilderBuildPath()}\\${sketchName}_${sketchMd5}`;
}

/**
   * 文件查找
   */
export async function findFile(basePath: string, fileName: string): Promise<string> {
    // 先判断basePath是否存在
    if (!window['fs'].existsSync(basePath)) {
        console.warn(`路径不存在: ${basePath}`);
        return '';
    }
    
    const findRes = await window['tools'].findFileByName(basePath, fileName);
    console.log(`find ${fileName} in tools: `, findRes);
    return findRes[0] || '';
}