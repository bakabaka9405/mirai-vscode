import { execSync } from 'child_process';
import { LanguagePreset } from '../models';
import { ILspConfigGenerator, ILspConfigResult } from './ILspConfigGenerator';

/**
 * Python LSP 配置生成器
 * 
 * 生成 pyrightconfig.json 供 Pylance/Pyright 使用
 */
export class PythonConfigGenerator implements ILspConfigGenerator {
    readonly languageId = 'python';
    readonly configFileName = 'pyrightconfig.json';
    readonly settingKey = 'generate_pyrightconfig';
    readonly fileExtensions = ['py', 'pyw'];

    async generate(
        srcFiles: string[],
        preset: LanguagePreset,
        srcBasePath: string,
        buildBasePath: string
    ): Promise<ILspConfigResult> {
        // 检测 Python 版本
        const pythonVersion = await this.detectPythonVersion(preset);

        const config = {
            include: ['.'],
            pythonVersion: pythonVersion || '3.11',
            typeCheckingMode: 'basic',
            extraPaths: [srcBasePath],
            reportMissingImports: 'warning',
            reportGeneralTypeIssues: 'warning',
            reportOptionalMemberAccess: 'warning'
        };

        return { success: true, config };
    }

    /**
     * 检测 Python 版本
     */
    private async detectPythonVersion(preset: LanguagePreset): Promise<string | null> {
        const interpreter = preset.interpreterPath || 'python';
        try {
            const output = execSync(`"${interpreter}" --version`, { 
                encoding: 'utf-8',
                windowsHide: true,
                timeout: 5000
            });
            const match = output.match(/Python\s+(\d+\.\d+)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }
}
