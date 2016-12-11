test('does simple interpolation', () => {
  const template = require('../template');
  const env = template.create();
  const result = template.preprocess(env, '<%= require("test") %>');
  expect({env, result}).toMatchSnapshot();
});
