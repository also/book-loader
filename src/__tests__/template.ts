import * as template from '../template';

test('does simple interpolation', () => {
  const env = template.create();
  expect(env).toMatchSnapshot();
  const preprocessed = template.preprocess(
    env,
    '<%= variable1 %> and <%- variable2 %>'
  );
  expect(env).toMatchSnapshot();
  expect(preprocessed).toMatchSnapshot();
  const postprocessed = template.postprocess(env, preprocessed);
  expect(postprocessed).toMatchSnapshot();
});

test('preprocess ignores non-strings', () => {
  const env = template.create();
  const preprocessed = template.preprocess(env, 7);
  expect(env).toMatchSnapshot();
  expect(preprocessed).toMatchSnapshot();
});

test('applies templates', () => {
  const result = template.apply(
    '<%= variable1 %><%- variable2 %> and <%= variable3 %>'
  );
  expect(result).toMatchSnapshot();
});

test('creates generators', () => {
  const generator = template.generator(
    '<%= variable1 %><%- variable2 %> and <%= variable3 %>'
  );
  for (const element of generator) {
    expect(element).toMatchSnapshot();
  }
});
