// 工具参数层：输入 schema 校验 + 章节/数字确定性归一化。
import { parseChapterNumber, normalizeChapterTarget } from './chapterUtils.js';

export function validateArgs(parameters = {}, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, errors: ['arguments 必须是对象'] };
  }
  const errors = [];
  const properties = parameters.properties || {};
  const required = Array.isArray(parameters.required) ? parameters.required : [];
  for (const key of required) {
    const value = args[key];
    if (value === undefined || value === null || value === '') {
      errors.push(`缺少必填参数 ${key}`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const schema = properties[key];
    if (!schema) continue;
    const type = schema.type;
    if (type === 'string' && typeof value !== 'string') {
      errors.push(`${key} 必须是字符串`);
    } else if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      errors.push(`${key} 必须是数字`);
    } else if (type === 'integer' && !Number.isInteger(value)) {
      errors.push(`${key} 必须是整数`);
    } else if (type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${key} 必须是布尔值`);
    } else if (type === 'array' && !Array.isArray(value)) {
      errors.push(`${key} 必须是数组`);
    } else if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push(`${key} 必须是对象`);
    }
    if (typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) errors.push(`${key} 过短`);
      if (schema.maxLength && value.length > schema.maxLength) errors.push(`${key} 过长`);
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errors.push(`${key} 只能是 ${schema.enum.join(' / ')}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// 参数归一化：整数型参数与标记 xChapterRef 的字符串参数做章节/数字确定性转换，
// 不依赖模型把“第一章”转成 1；转换不了才原样交给 validateArgs 拒绝。
// 属参数层标准化（校验层的一部分），不是针对单个工具的补丁。
export function normalizeToolArguments(parameters = {}, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const properties = parameters.properties || {};
  const out = { ...args };
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;
    const schema = properties[key];
    if (!schema) continue;
    if (schema.type === 'integer') {
      const num = parseChapterNumber(value);
      if (num != null) out[key] = num;
    } else if (schema.type === 'string' && schema.xChapterRef === true) {
      out[key] = normalizeChapterTarget(value);
    }
  }
  return out;
}
