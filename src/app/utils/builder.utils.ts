
export async function getDefaultBuildPath(sketchFilePath: string): Promise<string> {
    const sketchMd5Value = await window["tools"].calculateMD5(window['path'].dirname(window['path'].resolve(sketchFilePath)));
    const sketchMd5 = sketchMd5Value.slice(0, 8);
    const sketchName = window['path'].basename(sketchFilePath, '.ino');
    return `${window['path'].getAilyBuilderBuildPath()}\\${sketchName}_${sketchMd5}`;
}