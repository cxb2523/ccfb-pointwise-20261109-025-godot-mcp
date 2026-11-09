import { describe, it, expect } from 'vitest';
import { join as pathJoin, resolve as pathResolve } from 'path';
import {
  PARAMETER_MAPPINGS,
  REVERSE_PARAMETER_MAPPINGS,
  normalizeParameters,
  convertCamelToSnakeCase,
  validatePath,
  createErrorResponse,
  isGodot44OrLater,
  expandHomePath,
  resolveUserPath,
  buildWindowsGodotCandidates,
  buildMacGodotCandidates,
  LINUX_GODOT_BINARY_NAMES,
  buildGodotOperationArgs,
} from '../src/utils.js';

describe('PARAMETER_MAPPINGS', () => {
  it('maps snake_case to camelCase', () => {
    expect(PARAMETER_MAPPINGS['project_path']).toBe('projectPath');
    expect(PARAMETER_MAPPINGS['scene_path']).toBe('scenePath');
    expect(PARAMETER_MAPPINGS['node_path']).toBe('nodePath');
    expect(PARAMETER_MAPPINGS['node_type']).toBe('nodeType');
    expect(PARAMETER_MAPPINGS['node_name']).toBe('nodeName');
  });

  it('covers all expected parameter names', () => {
    const expectedKeys = [
      'project_path', 'scene_path', 'root_node_type', 'parent_node_path',
      'node_type', 'node_name', 'texture_path', 'node_path', 'output_path',
      'mesh_item_names', 'new_path', 'file_path', 'signal_name', 'target_path',
      'class_name', 'root_path', 'new_parent_path', 'keep_global_transform',
      'script_path', 'resource_type', 'resource_path', 'final_value',
      'trans_type', 'ease_type', 'type_hint', 'parent_path',
      // New mappings
      'directory_path', 'from_x', 'from_y', 'to_x', 'to_y',
      'project_name', 'action_name',
    ];
    for (const key of expectedKeys) {
      expect(PARAMETER_MAPPINGS).toHaveProperty(key);
    }
  });
});

describe('REVERSE_PARAMETER_MAPPINGS', () => {
  it('is the inverse of PARAMETER_MAPPINGS', () => {
    for (const [snake, camel] of Object.entries(PARAMETER_MAPPINGS)) {
      expect(REVERSE_PARAMETER_MAPPINGS[camel]).toBe(snake);
    }
  });

  it('has same number of entries as PARAMETER_MAPPINGS', () => {
    expect(Object.keys(REVERSE_PARAMETER_MAPPINGS).length).toBe(
      Object.keys(PARAMETER_MAPPINGS).length
    );
  });
});

describe('normalizeParameters', () => {
  it('converts snake_case keys to camelCase', () => {
    const result = normalizeParameters({ project_path: '/foo', scene_path: 'bar.tscn' });
    expect(result).toEqual({ projectPath: '/foo', scenePath: 'bar.tscn' });
  });

  it('preserves already-camelCase keys', () => {
    const result = normalizeParameters({ projectPath: '/foo', scenePath: 'bar.tscn' });
    expect(result).toEqual({ projectPath: '/foo', scenePath: 'bar.tscn' });
  });

  it('preserves unknown keys as-is', () => {
    const result = normalizeParameters({ custom_key: 'value', another: 42 });
    expect(result).toEqual({ custom_key: 'value', another: 42 });
  });

  it('handles nested objects', () => {
    const result = normalizeParameters({
      project_path: '/foo',
      nested: { node_path: '/root/Player' },
    });
    expect(result).toEqual({
      projectPath: '/foo',
      nested: { nodePath: '/root/Player' },
    });
  });

  it('preserves arrays without modification', () => {
    const result = normalizeParameters({ items: [1, 2, 3] });
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('returns falsy inputs as-is', () => {
    expect(normalizeParameters(null as any)).toBeNull();
    expect(normalizeParameters(undefined as any)).toBeUndefined();
  });

  it('handles empty object', () => {
    expect(normalizeParameters({})).toEqual({});
  });

  it('handles mixed snake_case and camelCase', () => {
    const result = normalizeParameters({
      project_path: '/foo',
      nodeName: 'Player',
    });
    expect(result).toEqual({ projectPath: '/foo', nodeName: 'Player' });
  });

  it('normalizes new parameter mappings', () => {
    const result = normalizeParameters({
      directory_path: 'scripts',
      from_x: 10, from_y: 20,
      to_x: 100, to_y: 200,
      project_name: 'MyGame',
      action_name: 'jump',
    });
    expect(result.directoryPath).toBe('scripts');
    expect(result.fromX).toBe(10);
    expect(result.fromY).toBe(20);
    expect(result.toX).toBe(100);
    expect(result.toY).toBe(200);
    expect(result.projectName).toBe('MyGame');
    expect(result.actionName).toBe('jump');
  });
});

describe('convertCamelToSnakeCase', () => {
  it('converts known camelCase keys to snake_case', () => {
    const result = convertCamelToSnakeCase({ projectPath: '/foo', scenePath: 'bar.tscn' });
    expect(result).toEqual({ project_path: '/foo', scene_path: 'bar.tscn' });
  });

  it('converts unknown camelCase keys using regex', () => {
    const result = convertCamelToSnakeCase({ myCustomKey: 'value' });
    expect(result).toEqual({ my_custom_key: 'value' });
  });

  it('handles nested objects', () => {
    const result = convertCamelToSnakeCase({
      projectPath: '/foo',
      nested: { nodePath: '/root' },
    });
    expect(result).toEqual({
      project_path: '/foo',
      nested: { node_path: '/root' },
    });
  });

  it('preserves arrays', () => {
    const result = convertCamelToSnakeCase({ items: [1, 2] });
    expect(result).toEqual({ items: [1, 2] });
  });

  it('handles empty object', () => {
    expect(convertCamelToSnakeCase({})).toEqual({});
  });

  it('preserves already snake_case keys', () => {
    const result = convertCamelToSnakeCase({ already_snake: 'value' });
    expect(result).toEqual({ already_snake: 'value' });
  });
});

describe('validatePath', () => {
  it('returns true for valid paths', () => {
    expect(validatePath('/home/user/project')).toBe(true);
    expect(validatePath('scenes/main.tscn')).toBe(true);
    expect(validatePath('C:\\Users\\test')).toBe(true);
  });

  it('returns false for paths with ..', () => {
    expect(validatePath('../../../etc/passwd')).toBe(false);
    expect(validatePath('foo/../bar')).toBe(false);
    expect(validatePath('..')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validatePath('')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(validatePath(null as any)).toBe(false);
    expect(validatePath(undefined as any)).toBe(false);
  });
});

describe('createErrorResponse', () => {
  it('returns object with isError true', () => {
    const result = createErrorResponse('Something went wrong');
    expect(result.isError).toBe(true);
  });

  it('includes error message in content', () => {
    const result = createErrorResponse('Test error');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Test error');
  });

  it('handles different error messages', () => {
    const result = createErrorResponse('Another error');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Another error');
  });
});

describe('isGodot44OrLater', () => {
  it('returns true for 4.4', () => {
    expect(isGodot44OrLater('4.4.0')).toBe(true);
    expect(isGodot44OrLater('4.4')).toBe(true);
  });

  it('returns true for versions after 4.4', () => {
    expect(isGodot44OrLater('4.5.0')).toBe(true);
    expect(isGodot44OrLater('5.0.0')).toBe(true);
    expect(isGodot44OrLater('4.10.1')).toBe(true);
  });

  it('returns false for versions before 4.4', () => {
    expect(isGodot44OrLater('4.3.0')).toBe(false);
    expect(isGodot44OrLater('4.0.0')).toBe(false);
    expect(isGodot44OrLater('3.5.0')).toBe(false);
  });

  it('returns false for non-matching strings', () => {
    expect(isGodot44OrLater('')).toBe(false);
    expect(isGodot44OrLater('invalid')).toBe(false);
  });

  it('handles version strings with extra info', () => {
    expect(isGodot44OrLater('4.4.1.stable')).toBe(true);
    expect(isGodot44OrLater('4.3.2.rc1')).toBe(false);
  });
});

describe('expandHomePath / resolveUserPath', () => {
  it('expands a leading ~ using the injected home directory', () => {
    expect(expandHomePath('~', '/home/alice')).toBe('/home/alice');
    expect(expandHomePath('~/Projects/demo', '/home/alice')).toBe(
      pathJoin('/home/alice', 'Projects/demo')
    );
  });

  it('leaves paths without a leading ~ untouched', () => {
    expect(expandHomePath('/abs/path', '/home/alice')).toBe('/abs/path');
    expect(expandHomePath('relative/path', '/home/alice')).toBe('relative/path');
  });

  it('resolveUserPath expands ~ then resolves to an absolute path', () => {
    const resolved = resolveUserPath('~/MyProject', '/home/alice');
    expect(resolved).toBe(pathResolve('/home/alice', 'MyProject'));
  });
});

describe('Godot executable candidate helpers', () => {
  it('buildWindowsGodotCandidates appends .exe when missing, leaves it alone otherwise', () => {
    expect(buildWindowsGodotCandidates('C:\\Games\\Godot\\Godot')).toEqual([
      'C:\\Games\\Godot\\Godot',
      'C:\\Games\\Godot\\Godot.exe',
    ]);
    expect(buildWindowsGodotCandidates('C:\\Games\\Godot\\Godot.exe')).toEqual([
      'C:\\Games\\Godot\\Godot.exe',
    ]);
  });

  it('buildMacGodotCandidates drills into a .app bundle before falling back to the bare path', () => {
    expect(buildMacGodotCandidates('/Applications/Godot_4.app')).toEqual([
      pathJoin('/Applications/Godot_4.app', 'Contents', 'MacOS', 'Godot_4'),
      pathJoin('/Applications/Godot_4.app', 'Contents', 'MacOS', 'Godot'),
      '/Applications/Godot_4.app',
    ]);
  });

  it('buildMacGodotCandidates passes non-bundle paths through unchanged', () => {
    expect(buildMacGodotCandidates('/usr/local/bin/godot')).toEqual(['/usr/local/bin/godot']);
  });

  it('LINUX_GODOT_BINARY_NAMES tries godot4, godot, Godot_v4 in that order', () => {
    expect(LINUX_GODOT_BINARY_NAMES).toEqual(['godot4', 'godot', 'Godot_v4']);
  });
});

// ---------------------------------------------------------------------------
// GodotExecutor subprocess argv construction.
//
// These two tests are the ones required by the GodotExecutor refactor: they
// verify the exact array buildGodotOperationArgs() returns is what reaches
// execFile/spawn as argv - the array a shell would otherwise have mangled by
// re-tokenizing on spaces or re-interpreting quotes/backslashes.
// ---------------------------------------------------------------------------
describe('buildGodotOperationArgs (subprocess argv construction)', () => {
  it('does not truncate or split a project path containing spaces and Chinese characters', () => {
    const projectPath = 'D:\\Games\\我的 项目\\test dir';
    const operationsScriptPath = '/opt/godot-mcp/scripts/godot_operations.gd';
    const args = buildGodotOperationArgs({
      projectPath,
      operationsScriptPath,
      operation: 'create_scene',
      paramsJson: '{"scene_path":"main.tscn"}',
    });

    // The path must survive as a single argv element, byte-for-byte, with no
    // shell-style re-tokenization on the embedded spaces and no mangling of
    // the multi-byte Chinese characters.
    expect(args).toContain(projectPath);
    const pathIndex = args.indexOf(projectPath);
    expect(args[pathIndex]).toBe(projectPath);
    expect(args[pathIndex].length).toBe(projectPath.length);
    expect(args[pathIndex]).toContain('我的 项目');
    expect(args[pathIndex]).toContain('test dir');

    // No element should have been split apart at the spaces: the array must
    // have exactly the 6 expected entries (no debug flag requested here),
    // not more than that from the path breaking into extra argv elements.
    expect(args).toEqual([
      '--headless',
      '--path',
      projectPath,
      '--script',
      operationsScriptPath,
      'create_scene',
      '{"scene_path":"main.tscn"}',
    ]);
  });

  it('passes a JSON params string with embedded quotes, backslashes, and newlines through unescaped and round-trippable', () => {
    const originalParams = {
      scene_path: 'main.tscn',
      note: 'He said "hi"\nSecond line with a backslash: C:\\Users\\测试',
    };
    const paramsJson = JSON.stringify(originalParams);

    const args = buildGodotOperationArgs({
      projectPath: '/tmp/project',
      operationsScriptPath: '/opt/godot-mcp/scripts/godot_operations.gd',
      operation: 'create_resource',
      paramsJson,
    });

    const jsonArg = args[args.length - 1];

    // The argv element must be byte-for-byte identical to the JSON string we
    // handed in - no extra escaping/unescaping applied by our own code.
    expect(jsonArg).toBe(paramsJson);

    // And it must parse back to exactly the original object: the quotes,
    // the newline, and the backslash all round-trip intact.
    expect(JSON.parse(jsonArg)).toEqual(originalParams);
    expect(JSON.parse(jsonArg).note).toContain('"hi"');
    expect(JSON.parse(jsonArg).note).toContain('\n');
    expect(JSON.parse(jsonArg).note).toContain('C:\\Users\\测试');
  });
});
