module.exports = {
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module'
  },
  'env': {
    'es6': true,
    'node': true
  },
  'extends': 'eslint:recommended',
  'rules': {
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single',
      {avoidEscape: true, allowTemplateLiterals: true}
    ],
    'semi': ['error', 'always'],
    'no-console': 'off',
    'object-curly-spacing': ['error', 'never']
  }
};
