/**
 * GameCube-Manager Files Security & Functionality Comprehensive Test Suite
 * Validates sandboxing, permissions, path traversal, roots, copy & move operations.
 */

import fs from 'fs';
import path from 'path';
import assert from 'node:assert/strict';

// Set test environment variables before module imports
const TEST_TMP_DIR = path.resolve('/tmp/gamecube_security_test_' + Date.now());
const TEST_DB_PATH = path.join(TEST_TMP_DIR, 'test_gamecube.db');

process.env.DB_PATH = TEST_DB_PATH;
process.env.DATA_DIR = TEST_TMP_DIR;
process.env.HOST_ROOT = '/host_root';
process.env.CUSTOM_GAMES_PATH = '/mnt/game_data/Games';
process.env.DOWNLOADS_PATH = '/mnt/game_data/Downloads';

// Ensure base directories exist
if (!fs.existsSync(TEST_TMP_DIR)) {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
}
if (!fs.existsSync('/mnt/game_data/Games')) {
  fs.mkdirSync('/mnt/game_data/Games', { recursive: true });
}
if (!fs.existsSync('/mnt/game_data/Downloads')) {
  fs.mkdirSync('/mnt/game_data/Downloads', { recursive: true });
}
if (!fs.existsSync('/downloads')) {
  fs.mkdirSync('/downloads', { recursive: true });
}
if (!fs.existsSync('/host_root')) {
  fs.mkdirSync('/host_root', { recursive: true });
}

// Dynamic imports to ensure env vars are applied
const Fastify = (await import('fastify')).default;
const jwt = (await import('@fastify/jwt')).default;
const multipart = (await import('@fastify/multipart')).default;
const { initDb, db, settingsQueries } = await import('../src/db/index.js');
const { filesRoutes, toDisplayPath } = await import('../src/routes/files.js');
const { config } = await import('../src/config.js');

// Test runner tracking
interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(category: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ name, category, passed: true, durationMs });
    console.log(`  ✓ [PASS] [${category}] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ name, category, passed: false, error: err?.message || String(err), durationMs });
    console.error(`  ✗ [FAIL] [${category}] ${name} (${durationMs}ms)`);
    console.error(`     Error: ${err?.message || err}`);
    if (err?.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🎮 GameCube-Manager: Files Manager QA & Security Test Suite');
  console.log('================================================================\n');

  // 1. Initialize SQLite Database
  initDb();

  // Configure settings
  settingsQueries.set('custom_games_path', '/mnt/game_data/Games');
  settingsQueries.set('downloads_path', '/mnt/game_data/Downloads');
  settingsQueries.set('host_root', '/host_root');

  // 2. Setup Fastify app with identical configuration
  const app = Fastify({ logger: false });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });
  await app.register(filesRoutes, { prefix: '/api/files' });
  await app.ready();

  // Generate tokens
  const adminToken = app.jwt.sign({ id: 1, username: 'admin', role: 'admin' });
  const userToken = app.jwt.sign({ id: 2, username: 'testuser', role: 'user' });

  // Unique test subdirectories to prevent collision and allow clean teardown
  const testRunId = 'test_' + Date.now();
  const testGamesDir = path.join('/mnt/game_data/Games', testRunId);
  const testDownloadsDir = path.join('/mnt/game_data/Downloads', testRunId);

  fs.mkdirSync(testGamesDir, { recursive: true });
  fs.mkdirSync(testDownloadsDir, { recursive: true });

  console.log(`📁 Test workspace created:`);
  console.log(`   Games: ${testGamesDir}`);
  console.log(`   Downloads: ${testDownloadsDir}\n`);

  // ================================================================
  // CATEGORY 1: Roots & Sandboxing
  // ================================================================
  console.log('--- Category 1: Roots & Sandboxing ---');

  await runTest('Sandboxing', 'GET /api/files/roots for regular user returns only 2 allowed roots & default games path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/roots',
      headers: { authorization: `Bearer ${userToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const data = res.json();
    assert.strictEqual(data.isAdmin, false);
    assert.strictEqual(Array.isArray(data.roots), true);
    assert.strictEqual(data.roots.length, 2, 'Regular user must receive exactly 2 roots');

    const rootNames = data.roots.map((r: any) => r.name);
    assert.ok(rootNames.includes('Игры'), 'Must include "Игры"');
    assert.ok(rootNames.includes('Загрузки'), 'Must include "Загрузки"');

    // Default path must be custom games path
    assert.strictEqual(data.defaultPath, toDisplayPath('/mnt/game_data/Games'));
  });

  await runTest('Sandboxing', 'GET /api/files/roots for admin returns 5 roots and root defaultPath', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/roots',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const data = res.json();
    assert.strictEqual(data.isAdmin, true);
    assert.strictEqual(Array.isArray(data.roots), true);
    assert.strictEqual(data.roots.length, 5, 'Admin must receive exactly 5 roots');

    const rootNames = data.roots.map((r: any) => r.name);
    assert.ok(rootNames.includes('Игры'));
    assert.ok(rootNames.includes('Steam common'));
    assert.ok(rootNames.includes('Загрузки'));
    assert.ok(rootNames.includes('Steam Userdata'));
    assert.ok(rootNames.includes('Корень'));

    assert.strictEqual(data.defaultPath, '/');
  });

  await runTest('Sandboxing', 'User CAN access and list custom games folder', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/list?path=${encodeURIComponent(testGamesDir)}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const data = res.json();
    assert.ok(Array.isArray(data.items));
  });

  await runTest('Sandboxing', 'User CAN access and list downloads folder', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/list?path=${encodeURIComponent(testDownloadsDir)}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const data = res.json();
    assert.ok(Array.isArray(data.items));
  });

  await runTest('Sandboxing', 'User default /list (no path param) resolves to games directory', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/list',
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const data = res.json();
    assert.strictEqual(data.currentPath, toDisplayPath('/mnt/game_data/Games'));
  });

  await runTest('Sandboxing', 'User CAN write and read files in custom games folder', async () => {
    const testFile = path.join(testGamesDir, 'user_game_file.txt');
    const writeRes = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { path: testFile, content: 'Sandbox Content for Game' },
    });
    assert.strictEqual(writeRes.statusCode, 200);

    const readRes = await app.inject({
      method: 'GET',
      url: `/api/files/read?path=${encodeURIComponent(testFile)}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(readRes.statusCode, 200);
    assert.strictEqual(readRes.json().content, 'Sandbox Content for Game');
  });

  await runTest('Sandboxing', 'User CAN write and read files in downloads folder', async () => {
    const testFile = path.join(testDownloadsDir, 'user_download_file.txt');
    const writeRes = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { path: testFile, content: 'Sandbox Download Content' },
    });
    assert.strictEqual(writeRes.statusCode, 200);

    const readRes = await app.inject({
      method: 'GET',
      url: `/api/files/read?path=${encodeURIComponent(testFile)}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(readRes.statusCode, 200);
    assert.strictEqual(readRes.json().content, 'Sandbox Download Content');
  });

  await runTest('Sandboxing', 'User CAN download file from allowed directory', async () => {
    const testFile = path.join(testGamesDir, 'download_me.txt');
    fs.writeFileSync(testFile, 'Binary Or Text Stream');
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/download?path=${encodeURIComponent(testFile)}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, 'Binary Or Text Stream');
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from listing root (/)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=/',
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().error, 'Forbidden');
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from listing host root (/host_root)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=/host_root',
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().error, 'Forbidden');
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from listing system directory (/etc)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=/etc',
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().error, 'Forbidden');
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from reading /etc/passwd', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/read?path=/etc/passwd',
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().error, 'Forbidden');
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from downloading /etc/passwd', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/download?path=/etc/passwd',
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().error, 'Forbidden');
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from writing to system directory (/etc)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/write',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { path: '/etc/evil_hack.txt', content: 'malicious payload' },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from mkdir in system directory (/etc)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/mkdir',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { path: '/etc/evil_dir' },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from Path Traversal (/mnt/game_data/Games/../../etc/passwd)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/read?path=${encodeURIComponent('/mnt/game_data/Games/../../etc/passwd')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from Path Traversal in /list (/mnt/game_data/Games/../../etc)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/list?path=${encodeURIComponent('/mnt/game_data/Games/../../etc')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from relative Path Traversal (../../../etc/passwd)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/read?path=${encodeURIComponent('../../../etc/passwd')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from prefix-matching trick (/mnt/game_data/Games_fake)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/list?path=${encodeURIComponent('/mnt/game_data/Games_fake')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from deleting allowed root /mnt/game_data/Games', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/files?path=${encodeURIComponent('/mnt/game_data/Games')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.json().message?.includes('корневую директорию'));
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from deleting allowed root /mnt/game_data/Downloads', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/files?path=${encodeURIComponent('/mnt/game_data/Downloads')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.json().message?.includes('корневую директорию'));
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from deleting allowed root /downloads', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/files?path=${encodeURIComponent('/downloads')}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.json().message?.includes('корневую директорию'));
  });

  await runTest('Sandboxing', 'User is BLOCKED (403) from renaming allowed root /mnt/game_data/Games', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/rename',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { oldPath: '/mnt/game_data/Games', newPath: '/mnt/game_data/Games_Renamed' },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.json().message?.includes('корневую директорию'));
  });

  await runTest('Sandboxing', 'Admin is BLOCKED (403) from deleting root directory / and /host_root', async () => {
    const res1 = await app.inject({
      method: 'DELETE',
      url: '/api/files?path=/',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res1.statusCode, 403);

    const res2 = await app.inject({
      method: 'DELETE',
      url: '/api/files?path=/host_root',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res2.statusCode, 403);
  });

  await runTest('Sandboxing', 'Admin CAN access root (/), /etc and read /etc/passwd', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=/etc',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(listRes.statusCode, 200);

    const readRes = await app.inject({
      method: 'GET',
      url: '/api/files/read?path=/etc/passwd',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(readRes.statusCode, 200);
    assert.ok(readRes.json().content.includes('root:'));
  });

  // ================================================================
  // CATEGORY 2: Copy Operations
  // ================================================================
  console.log('\n--- Category 2: Copy Operations ---');

  const copyDir = path.join(testGamesDir, 'copy_tests');
  fs.mkdirSync(copyDir, { recursive: true });

  await runTest('Copy', 'Copy file to target folder succeeds and preserves original file', async () => {
    const srcFile = path.join(copyDir, 'file_to_copy.txt');
    const destDir = path.join(copyDir, 'dest_folder_1');
    fs.writeFileSync(srcFile, 'Data to be copied 123');
    fs.mkdirSync(destDir, { recursive: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcFile, destination: destDir },
    });

    assert.strictEqual(res.statusCode, 200);
    const expectedDest = path.join(destDir, 'file_to_copy.txt');
    assert.ok(fs.existsSync(expectedDest), 'Destination file must exist');
    assert.strictEqual(fs.readFileSync(expectedDest, 'utf-8'), 'Data to be copied 123');
    assert.ok(fs.existsSync(srcFile), 'Source file must remain intact');
  });

  await runTest('Copy', 'Copy file without overwrite returns 409 Conflict with { exists: true, message: ... }', async () => {
    const srcFile = path.join(copyDir, 'file_to_copy.txt');
    const destDir = path.join(copyDir, 'dest_folder_1');
    // Destination file already exists from previous test

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcFile, destination: destDir },
    });

    assert.strictEqual(res.statusCode, 409, 'Must return HTTP 409 Conflict');
    const data = res.json();
    assert.strictEqual(data.exists, true, 'Response must contain exists: true');
    assert.strictEqual(data.error, 'Target exists');
    assert.ok(data.message.includes('уже существует в целевой папке'), 'Message must inform user about existing item');
    assert.ok(data.message.includes('file_to_copy.txt'));
  });

  await runTest('Copy', 'Copy file with overwrite: true successfully replaces target file', async () => {
    const srcFileV2 = path.join(copyDir, 'file_v2.txt');
    const destDir = path.join(copyDir, 'dest_folder_1');
    fs.writeFileSync(srcFileV2, 'New Version Content 456');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        source: srcFileV2,
        destination: path.join(destDir, 'file_to_copy.txt'),
        overwrite: true,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const destFile = path.join(destDir, 'file_to_copy.txt');
    assert.strictEqual(fs.readFileSync(destFile, 'utf-8'), 'New Version Content 456');
    assert.ok(fs.existsSync(srcFileV2), 'Source v2 must still exist');
  });

  await runTest('Copy', 'Copy directory recursively with nested files and folders', async () => {
    const srcTree = path.join(copyDir, 'source_tree');
    const destFolder = path.join(copyDir, 'dest_tree_folder');
    fs.mkdirSync(path.join(srcTree, 'nested', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(srcTree, 'root_file.txt'), 'Root Tree File');
    fs.writeFileSync(path.join(srcTree, 'nested', 'nested_file.txt'), 'Nested File');
    fs.writeFileSync(path.join(srcTree, 'nested', 'deep', 'deep_file.txt'), 'Deep File');

    fs.mkdirSync(destFolder, { recursive: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcTree, destination: destFolder },
    });

    assert.strictEqual(res.statusCode, 200);
    const copiedRoot = path.join(destFolder, 'source_tree');
    assert.ok(fs.existsSync(path.join(copiedRoot, 'root_file.txt')));
    assert.ok(fs.existsSync(path.join(copiedRoot, 'nested', 'nested_file.txt')));
    assert.ok(fs.existsSync(path.join(copiedRoot, 'nested', 'deep', 'deep_file.txt')));
    assert.strictEqual(fs.readFileSync(path.join(copiedRoot, 'nested', 'deep', 'deep_file.txt'), 'utf-8'), 'Deep File');
    // Original intact
    assert.ok(fs.existsSync(srcTree));
  });

  await runTest('Copy', 'Copy directory without overwrite returns 409 Conflict', async () => {
    const srcTree = path.join(copyDir, 'source_tree');
    const destFolder = path.join(copyDir, 'dest_tree_folder');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcTree, destination: destFolder },
    });

    assert.strictEqual(res.statusCode, 409);
    const data = res.json();
    assert.strictEqual(data.exists, true);
    assert.ok(data.message.includes('source_tree'));
  });

  await runTest('Copy', 'Copy directory with overwrite: true succeeds and replaces directory', async () => {
    const srcTree = path.join(copyDir, 'source_tree');
    const destFolder = path.join(copyDir, 'dest_tree_folder');
    // Modify a file in source to verify replacement
    fs.writeFileSync(path.join(srcTree, 'root_file.txt'), 'Updated Root Content');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        source: srcTree,
        destination: path.join(destFolder, 'source_tree'),
        overwrite: true,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(
      fs.readFileSync(path.join(destFolder, 'source_tree', 'root_file.txt'), 'utf-8'),
      'Updated Root Content'
    );
  });

  await runTest('Copy', 'Protection against copying directory into itself returns 400 Bad Request', async () => {
    const srcTree = path.join(copyDir, 'source_tree');

    // Case 1: source == destination
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcTree, destination: srcTree },
    });
    assert.strictEqual(res1.statusCode, 400);
    assert.ok(res1.json().message?.includes('самой себя'));

    // Case 2: destination is a subfolder of source
    const subFolder = path.join(srcTree, 'nested');
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcTree, destination: subFolder },
    });
    assert.strictEqual(res2.statusCode, 400);
    assert.ok(res2.json().message?.includes('самой себя'));
  });

  await runTest('Copy', 'Protection against copying file to itself returns 400 Bad Request', async () => {
    const file = path.join(copyDir, 'file_to_copy.txt');
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: file, destination: file },
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.json().message?.includes('совпадают'));
  });

  await runTest('Copy', 'Copy from forbidden path (/etc/passwd) to allowed root is BLOCKED (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: '/etc/passwd', destination: copyDir },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await runTest('Copy', 'Copy from allowed root to forbidden path (/etc/stolen.txt) is BLOCKED (403)', async () => {
    const file = path.join(copyDir, 'file_to_copy.txt');
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/copy',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: file, destination: '/etc/stolen.txt' },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  // ================================================================
  // CATEGORY 3: Move Operations
  // ================================================================
  console.log('\n--- Category 3: Move Operations ---');

  const moveDir = path.join(testGamesDir, 'move_tests');
  fs.mkdirSync(moveDir, { recursive: true });

  await runTest('Move', 'Move file to target folder succeeds and removes source file', async () => {
    const srcFile = path.join(moveDir, 'move_original.txt');
    const destDir = path.join(moveDir, 'dest_folder_move');
    fs.writeFileSync(srcFile, 'Unique Move Data 789');
    fs.mkdirSync(destDir, { recursive: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcFile, destination: destDir },
    });

    assert.strictEqual(res.statusCode, 200);
    const expectedDest = path.join(destDir, 'move_original.txt');
    assert.ok(fs.existsSync(expectedDest), 'Moved file must exist in destination');
    assert.strictEqual(fs.readFileSync(expectedDest, 'utf-8'), 'Unique Move Data 789');
    assert.ok(!fs.existsSync(srcFile), 'Source file must be deleted after move');
  });

  await runTest('Move', 'Move file without overwrite returns 409 Conflict with { exists: true, message: ... }', async () => {
    const srcFile = path.join(moveDir, 'another_file.txt');
    const destDir = path.join(moveDir, 'dest_folder_move');
    fs.writeFileSync(srcFile, 'Different Content');
    // Target move_original.txt already exists in destDir

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        source: srcFile,
        destination: path.join(destDir, 'move_original.txt'),
      },
    });

    assert.strictEqual(res.statusCode, 409);
    const data = res.json();
    assert.strictEqual(data.exists, true);
    assert.strictEqual(data.error, 'Target exists');
    assert.ok(data.message.includes('уже существует в целевой папке'));
    // Ensure source file was NOT deleted
    assert.ok(fs.existsSync(srcFile), 'Source file must remain untouched on conflict');
  });

  await runTest('Move', 'Move file with overwrite: true replaces target and deletes source', async () => {
    const srcFile = path.join(moveDir, 'another_file.txt');
    const destFile = path.join(moveDir, 'dest_folder_move', 'move_original.txt');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        source: srcFile,
        destination: destFile,
        overwrite: true,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(fs.readFileSync(destFile, 'utf-8'), 'Different Content');
    assert.ok(!fs.existsSync(srcFile), 'Source file must be removed after overwritten move');
  });

  await runTest('Move', 'Move directory with subfiles recursively', async () => {
    const srcTree = path.join(moveDir, 'dir_to_move');
    const destFolder = path.join(moveDir, 'move_target_box');
    fs.mkdirSync(path.join(srcTree, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(srcTree, 'root.txt'), 'Dir Root');
    fs.writeFileSync(path.join(srcTree, 'nested', 'child.txt'), 'Dir Child');

    fs.mkdirSync(destFolder, { recursive: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcTree, destination: destFolder },
    });

    assert.strictEqual(res.statusCode, 200);
    const expectedTarget = path.join(destFolder, 'dir_to_move');
    assert.ok(fs.existsSync(path.join(expectedTarget, 'root.txt')));
    assert.ok(fs.existsSync(path.join(expectedTarget, 'nested', 'child.txt')));
    assert.ok(!fs.existsSync(srcTree), 'Original directory tree must be deleted after move');
  });

  await runTest('Move', 'Move directory without overwrite when destination exists returns 409 Conflict', async () => {
    const newSrcTree = path.join(moveDir, 'dir_to_move');
    fs.mkdirSync(newSrcTree, { recursive: true });
    fs.writeFileSync(path.join(newSrcTree, 'test.txt'), 'Hello');

    const destFolder = path.join(moveDir, 'move_target_box');
    // destination 'dir_to_move' already exists inside destFolder

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        source: newSrcTree,
        destination: destFolder,
      },
    });

    assert.strictEqual(res.statusCode, 409);
    const data = res.json();
    assert.strictEqual(data.exists, true);
    assert.ok(fs.existsSync(newSrcTree), 'Source must not be removed on conflict');
  });

  await runTest('Move', 'Move directory with overwrite: true succeeds and deletes source', async () => {
    const newSrcTree = path.join(moveDir, 'dir_to_move');
    const destFolder = path.join(moveDir, 'move_target_box');
    const destTarget = path.join(destFolder, 'dir_to_move');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        source: newSrcTree,
        destination: destFolder,
        overwrite: true,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(fs.existsSync(path.join(destTarget, 'test.txt')));
    assert.ok(!fs.existsSync(newSrcTree), 'Source must be deleted after overwrite move');
  });

  await runTest('Move', 'Protection against moving directory into itself returns 400 Bad Request', async () => {
    const testFolder = path.join(moveDir, 'self_move_folder');
    const subFolder = path.join(testFolder, 'inner');
    fs.mkdirSync(subFolder, { recursive: true });

    // Case 1: source == destination
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: testFolder, destination: testFolder },
    });
    assert.strictEqual(res1.statusCode, 400);

    // Case 2: destination inside source
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: testFolder, destination: subFolder },
    });
    assert.strictEqual(res2.statusCode, 400);
    assert.ok(res2.json().message?.includes('саму в себя'));
  });

  await runTest('Move', 'Protection against moving file to itself returns 400 Bad Request', async () => {
    const file = path.join(moveDir, 'self_file.txt');
    fs.writeFileSync(file, 'Self');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: file, destination: file },
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.json().message?.includes('совпадают'));
  });

  await runTest('Move', 'Cross-boundary move between allowed roots (Games -> Downloads) succeeds', async () => {
    const srcFile = path.join(testGamesDir, 'cross_boundary.txt');
    fs.writeFileSync(srcFile, 'Cross boundary data');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcFile, destination: testDownloadsDir },
    });

    assert.strictEqual(res.statusCode, 200);
    const destFile = path.join(testDownloadsDir, 'cross_boundary.txt');
    assert.ok(fs.existsSync(destFile));
    assert.ok(!fs.existsSync(srcFile));
  });

  await runTest('Move', 'Move from allowed root to forbidden path is BLOCKED (403)', async () => {
    const srcFile = path.join(testGamesDir, 'escape_attempt.txt');
    fs.writeFileSync(srcFile, 'Should not escape');

    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: srcFile, destination: '/etc/escaped.txt' },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.ok(fs.existsSync(srcFile), 'Source must remain untouched');
  });

  await runTest('Move', 'Move from forbidden path (/etc/passwd) to allowed root is BLOCKED (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/files/move',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { source: '/etc/passwd', destination: testGamesDir },
    });

    assert.strictEqual(res.statusCode, 403);
  });

  // ================================================================
  // TEARDOWN & CLEANUP
  // ================================================================
  console.log('\n--- Teardown & Cleanup ---');

  try {
    fs.rmSync(testGamesDir, { recursive: true, force: true });
    fs.rmSync(testDownloadsDir, { recursive: true, force: true });
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    console.log('  ✓ Temporary test directories & database successfully removed.');
  } catch (err: any) {
    console.error('  ✗ Teardown error:', err?.message || err);
  }

  await app.close();
  db.close();

  // ================================================================
  // SUMMARY REPORT
  // ================================================================
  console.log('\n================================================================');
  console.log('📊 TEST SUMMARY REPORT');
  console.log('================================================================');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total tests:  ${total}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - [${r.category}] ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Security & Functionality Verified.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
