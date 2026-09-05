(function (root) {
  'use strict';

  function detectFormat(content) {
    const start = String(content || '').replace(/^\s*(?:<!--[\s\S]*?-->\s*)*/, '');
    // Only inspect the beginning: fenced examples and HTML mentioned in prose stay Markdown.
    return /^(?:<!doctype\s+html\b|<[a-z][a-z0-9-]*(?=[\s/>]))/i.test(start) ? 'html' : 'mixed';
  }

  function resolveFormat(format, content) {
    return ['html', 'mixed', 'markdown', 'latex'].includes(format) ? format : detectFormat(content);
  }

  function renderHtml(target, content) {
    const frame = document.createElement('iframe');
    frame.className = 'html-frame';
    frame.title = 'HTML 文档预览';
    // Never add allow-same-origin: uploaded scripts must not read the editor or its key.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    const policy = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; img-src https: data:; font-src https://cdn.jsdelivr.net data:; media-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    // Put restrictions before any user content, including scripts in its <head>.
    frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="viewport" content="width=device-width,initial-scale=1">' + String(content);
    target.classList.add('html-preview');
    target.replaceChildren(frame);
  }

  const api = { detectFormat, resolveFormat, renderHtml };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MkHtml = api;
})(typeof window === 'object' ? window : globalThis);
