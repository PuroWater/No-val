import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyProviderError } from '../src/lib/providerErrors.js';

test('401 maps to invalid apiKey', () => {
  const out = friendlyProviderError(new Error('模型调用失败 (401) {"error":"Authentication Fails"}'));
  assert.match(out, /API Key 不合法/);
  assert.ok(!out.includes('(401) {"error"'));
});

test('404 maps to wrong baseUrl', () => {
  assert.match(friendlyProviderError(new Error('模型调用失败 (404) not found')), /接口地址不正确/);
});

test('429 maps to rate/quota', () => {
  assert.match(friendlyProviderError(new Error('模型调用失败 (429) rate limited')), /额度用尽|过于频繁/);
});

test('5xx maps to server unavailable', () => {
  assert.match(friendlyProviderError(new Error('模型调用失败 (503) upstream')), /服务端暂时不可用/);
});

test('400 with model keyword maps to model not found', () => {
  assert.match(friendlyProviderError(new Error('模型调用失败 (400) {"error":"model does not exist"}')), /模型名称不存在/);
});

test('network failure maps to connection hint', () => {
  assert.match(friendlyProviderError(new Error('模型网络请求失败：fetch failed')), /无法连接/);
});

test('timeout maps to timeout hint', () => {
  assert.match(friendlyProviderError(new Error('模型请求超时')), /连接超时/);
});

test('thinking capability hint stays friendly', () => {
  const out = friendlyProviderError(new Error('模型调用失败 (400) {"error":"thinking unsupported"}。当前模型可能不支持思考或关思考，请到设置页“模型配置”调整'));
  assert.match(out, /可能不支持思考或关思考/);
  assert.ok(!out.includes('{"error"'));
});

test('missing apiKey message passes through unchanged', () => {
  const out = friendlyProviderError(new Error('未配置模型 API Key，请在设置页“模型配置”中填写。'));
  assert.equal(out, '未配置模型 API Key，请在设置页“模型配置”中填写。');
});

test('unknown message falls back to original', () => {
  const out = friendlyProviderError(new Error('自定义未知错误'));
  assert.equal(out, '自定义未知错误');
});
