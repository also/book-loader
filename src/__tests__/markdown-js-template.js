function createMd(options) {
  const markdownJsTemplate = require('../markdown-js-template');
  const markdownIt = require('markdown-it');
  return markdownIt(options).use(markdownJsTemplate);
}

test('handles links', () => {
  const md = createMd();
  const result = md.render('[a test](test.md)');
  expect(result).toMatchSnapshot();
});

test('handles templates in code blocks', () => {
  const md = createMd();
  const result = md.render('```\n<%= require("content") %>\n```');
  expect(result).toMatchSnapshot();
});

xtest('handles templates in links', () => {
  const md = createMd();
  const result = md.render(`[link](<%= require('target') %>)`);
  expect(result).toMatchSnapshot();
});

test('handles templates at top level', () => {
  const md = createMd();
  const result = md.render('# check out this variable\n\n<%= variable %>');
  expect(result).toMatchSnapshot();
});

test('handles templates in html block tags', () => {
  const md = createMd({html: true});
  const result = md.render('<p><%= variable %></p>');
  expect(result).toMatchSnapshot();
});

test('handles templates in html block tags', () => {
  const md = createMd({html: true});
  const result = md.render('<p>here is a variable: <%= variable %>!</p>');
  expect(result).toMatchSnapshot();
});

test('handles templates in markdown blocks', () => {
  const md = createMd();
  const result = md.render('Check out this variable: <%= variable %>');
  expect(result).toMatchSnapshot();
});

test('handles templates in inline html', () => {
  const md = createMd({html: true});
  const result = md.render('Check out this variable: <code><%= variable %></code>');
  expect(result).toMatchSnapshot();
});
