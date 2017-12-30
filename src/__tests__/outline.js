const cheerio = require('cheerio');
const markdownIt = require('markdown-it');
const outline = require('../outline');

function createHtml(str, options={}) {
  return cheerio.load(markdownIt(options).render(str));
}

it('parses simple outline', () => {
  expect(outline(createHtml(
`
* [One](one.md)
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('parses tag in link', () => {
  expect(outline(createHtml(
`
* [*One*](one.md)
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('parses link in tag', () => {
  expect(outline(createHtml(
`
* *[One](one.md)*
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('parses nested list', () => {
  expect(outline(createHtml(
`
* [One](one.md)
  * [One A](one-a.md)
  * [One b](one-b.md)
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('ignores comments', () => {
  expect(outline(createHtml(
`
* [One](one.md)
* [Two](two.md)

<!-- ignore me -->
`,
  {html: true}))).toMatchSnapshot();
});
