function createHtml(str, options={}) {
  const markdownIt = require('markdown-it');
  return markdownIt(options).render(str);
}

it('parses simple outline', () => {
  const outline = require('../outline');
  expect(outline(createHtml(
`
* [One](one.md)
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('parses tag in link', () => {
  const outline = require('../outline');
  expect(outline(createHtml(
`
* [*One*](one.md)
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('parses link in tag', () => {
  const outline = require('../outline');
  expect(outline(createHtml(
`
* *[One](one.md)*
* [Two](two.md)
`
  ))).toMatchSnapshot();
});

it('parses nested list', () => {
  const outline = require('../outline');
  expect(outline(createHtml(
`
* [One](one.md)
  * [One A](one-a.md)
  * [One b](one-b.md)
* [Two](two.md)
`
  ))).toMatchSnapshot();
});
