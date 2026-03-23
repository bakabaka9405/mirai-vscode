import { LanguagePreset } from '../models';
import { ILspConfigGenerator, ILspConfigResult } from './ILspConfigGenerator';
import { LanguageHandlerRegistry } from '../handlers';

/**
 * C/C++ LSP 配置生成器
 * 
 * 生成 compile_commands.json 供 clangd/ccls 使用
 */
export class CppConfigGenerator implements ILspConfigGenerator {
    readonly languageId = 'cpp';
    readonly configFileName = 'compile_commands.json';
    readonly settingKey = 'generate_compile_commands';
    readonly fileExtensions = ['cpp', 'cc', 'cxx', 'c++', 'c', 'h', 'hpp'];

    async generate(
        srcFiles: string[],
        preset: LanguagePreset,
        srcBasePath: string,
        buildBasePath: string
    ): Promise<ILspConfigResult> {
        // 只为 C/C++ 预设生成
        if (!['cpp', 'c'].includes(preset.languageId)) {
            return { success: true };
        }

        const registry = LanguageHandlerRegistry.getInstance();
        const handler = registry.getHandler(preset.languageId);

        if (!handler?.getCompileCommandString) {
            return { 
                success: false, 
                warning: '无法生成 compile_commands.json：当前语言处理器不支持' 
            };
        }

        // 只处理源文件（排除头文件）
        const sourceFiles = srcFiles.filter(f => 
            f.endsWith('.cpp') || f.endsWith('.cc') || f.endsWith('.cxx') || 
            f.endsWith('.c++') || f.endsWith('.c')
        );

        const commands = sourceFiles.map(file => ({
            directory: srcBasePath,
            command: handler.getCompileCommandString!(file, preset, srcBasePath, buildBasePath),
            file: file
        }));

        return { success: true, config: commands };
    }
}
