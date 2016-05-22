const path = require('path');
const BookPlugin = require('book-loader/plugin');

const src = path.join(__dirname, 'src');

module.exports = {
  context: src,
  entry: {},
  output: {
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
  plugins: [new BookPlugin({entry: ['./SUMMARY.md']})]
}
