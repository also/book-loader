function createMd() {
  const markdownJsTemplate = require('../markdown-js-template');
  const markdownIt = require('markdown-it');
  return markdownIt().use(markdownJsTemplate);
}

test('handles links', () => {
  const md = createMd();
  const result = md.render('[a test](test.md)');
  expect(result).toMatchSnapshot();
});

test('allows templates in code blocks', () => {
  const md = createMd();
  const result = md.render('```\n<%= require("content") %>\n```');
  expect(result).toMatchSnapshot();
});

xtest('allows templates in links', () => {
  const md = createMd();
  const result = md.render(`[link](<%= require('target') %>)`);
  expect(result).toMatchSnapshot();
});
