const path = require('path');
const BookPlugin = require('book-loader/plugin');

const src = path.join(__dirname, 'src');

module.exports = {
  context: src,
  entry: './SUMMARY.md',
  output: {
    // TODO I think this is the default
    // https://gist.github.com/sokra/27b24881210b56bbaff7#gistcomment-1741297
    // but not including it throws an error
    filename: '[name].js',
    path: 'dist',
    publicPath: '/book/'
  },
  module: {
    loaders: [
      {
        test: /\.md$/,
        loaders: [{
          loader: 'book',
          query: {template: path.join(src, 'template.md')}
        }]
      },
      {
        test: /\.(png)$/,
        loader: 'file'
      }
    ]
  },
  plugins: [new BookPlugin()]
}
