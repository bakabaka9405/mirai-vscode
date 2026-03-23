import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { LanguagePreset } from '../models';
import { ILspConfigGenerator, ILspConfigResult } from './ILspConfigGenerator';

/**
 * Rust LSP 配置生成器
 * 
 * 生成 rust-project.json 供 rust-analyzer 使用
 */
export class RustConfigGenerator implements ILspConfigGenerator {
    readonly languageId = 'rust';
    readonly configFileName = 'rust-project.json';
    readonly settingKey = 'generate_rust_project';
    readonly fileExtensions = ['rs'];

    async generate(
        srcFiles: string[],
        preset: LanguagePreset,
        srcBasePath: string,
        buildBasePath: string
    ): Promise<ILspConfigResult> {
        // 获取 sysroot
        const sysroot = await this.getSysroot(preset);
        if (!sysroot) {
            return {
                success: false,
                warning: '无法检测 Rust sysroot，rust-project.json 生成失败。请确保 rustc 已安装并在 PATH 中。'
            };
        }

        // 检查 sysroot_src 是否存在
        const sysrootSrc = path.join(sysroot, 'lib', 'rustlib', 'src', 'rust', 'library');
        if (!fs.existsSync(sysrootSrc)) {
            return {
                success: false,
                warning: 'Rust 源码未安装，rust-project.json 生成失败。请运行: rustup component add rust-src'
            };
        }

        // 构建 crates 列表
        const crates = srcFiles.map(file => ({
            root_module: file,
            edition: '2021',
            deps: [] as { crate: number; name: string }[],
            cfg: [] as string[],
            env: {} as Record<string, string>,
            is_proc_macro: false
        }));

        const config = {
            sysroot: sysroot,
            sysroot_src: sysrootSrc,
            crates: crates
        };

        return { success: true, config };
    }

    /**
     * 获取 Rust sysroot 路径
     */
    private async getSysroot(preset: LanguagePreset): Promise<string | null> {
        const rustc = preset.compilerPath || 'rustc';
        try {
            const output = execSync(`"${rustc}" --print sysroot`, {
                encoding: 'utf-8',
                windowsHide: true,
                timeout: 5000
            });
            return output.trim();
        } catch {
            return null;
        }
    }
}
