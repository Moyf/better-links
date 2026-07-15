import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, parse, resolve } from 'path';
import { fileURLToPath } from 'url';

// 获取 manifest.json 中的插件 ID（从 dist/ 读取）
const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '..', 'dist', 'manifest.json'); // ← 从 dist/ 读取
const manifest = JSON.parse(
	readFileSync(manifestPath, 'utf-8')
);
const pluginId = manifest.id;

const envResult = findEnvValue('VAULT_PATH', process.cwd());
const configuredVaultPath = process.env.VAULT_PATH?.trim() || envResult?.value;

if (!configuredVaultPath) {
	throw new Error('VAULT_PATH is not set. Add it to .env in the repository or one of its parent directories.');
}

const vaultPath = isAbsolute(configuredVaultPath)
	? configuredVaultPath
	: resolve(envResult?.directory ?? process.cwd(), configuredVaultPath);
const obsidianConfigPath = join(vaultPath, '.obsidian');

if (!existsSync(vaultPath)) {
	throw new Error(`Vault directory does not exist: ${vaultPath}`);
}
if (!existsSync(obsidianConfigPath)) {
	throw new Error(`Vault directory does not contain .obsidian: ${vaultPath}`);
}

const localPluginPath = join(obsidianConfigPath, 'plugins', pluginId);

// 确保目标目录存在
if (!existsSync(localPluginPath)) {
	mkdirSync(localPluginPath, { recursive: true });
}

// 拷贝必要文件
const filesToCopy = [
	'main.js',
	'manifest.json',
	'styles.css'
];

for (const file of filesToCopy) {
	const src = join(__dirname, '..', 'dist', file);
	const dest = join(localPluginPath, file);

	// 检查源文件是否存在（styles.css 可选）
	if (existsSync(src)) {
		copyFileSync(src, dest);
		console.log(`✓ Copied ${file} to local plugins`);
	} else if (file !== 'styles.css') {
		console.warn(`⚠ Warning: ${file} not found in dist/`);
	}
}

// 创建 .hotreload 文件（如果不存在）
const hotreloadPath = join(localPluginPath, '.hotreload');
if (!existsSync(hotreloadPath)) {
	writeFileSync(hotreloadPath, '');
	console.log(`✓ Created .hotreload file`);
}

console.log(`\n✅ Build and copy completed for plugin: ${pluginId}`);
console.log(`📁 Target: ${localPluginPath}`);

function findEnvValue(key, startDirectory) {
	let directory = resolve(startDirectory);
	const root = parse(directory).root;

	while (true) {
		const envPath = join(directory, '.env');
		if (existsSync(envPath)) {
			const value = parseEnvValue(readFileSync(envPath, 'utf-8'), key);
			if (value !== undefined) return { value, directory };
		}
		if (directory === root) return null;
		directory = dirname(directory);
	}
}

function parseEnvValue(contents, key) {
	for (const line of contents.split(/\r?\n/u)) {
		const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
		if (!match || match[1] !== key) continue;

		const rawValue = match[2].trim();
		if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"))) {
			return rawValue.slice(1, -1);
		}
		return rawValue.replace(/\s+#.*$/u, '').trim();
	}
	return undefined;
}
