import { LanguagePreset } from '../models';

/**
 * LSP 配置生成结果
 */
export interface ILspConfigResult {
    /** 是否成功 */
    success: boolean;
    /** 生成的配置对象 */
    config?: object;
    /** 警告信息 */
    warning?: string;
}

/**
 * LSP 配置生成器接口
 * 
 * 每种语言实现此接口以生成对应的 LSP 配置文件
 */
export interface ILspConfigGenerator {
    /** 语言标识符 */
    readonly languageId: string;

    /** 配置文件名 */
    readonly configFileName: string;

    /** 对应的配置项名称（如 'generate_compile_commands'） */
    readonly settingKey: string;

    /** 支持的文件扩展名（不含点号） */
    readonly fileExtensions: string[];

    /**
     * 生成配置内容
     * 
     * @param srcFiles 源文件列表（完整路径）
     * @param preset 当前语言预设
     * @param srcBasePath 源文件基目录
     * @param buildBasePath 构建输出目录
     * @returns 生成结果
     */
    generate(
        srcFiles: string[],
        preset: LanguagePreset,
        srcBasePath: string,
        buildBasePath: string
    ): Promise<ILspConfigResult>;
}
