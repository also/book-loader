const path = require('path');

module.exports = {
  entry: 'SUMMARY',
  output: {
    // TODO I think this is the default
    // https://gist.github.com/sokra/27b24881210b56bbaff7#gistcomment-1741297
    // but not including it throws an error
    filename: '[name].js',
    path: 'dist',
    publicPath: '/dist/'
  },
  resolve: {
    modules: [path.join(__dirname, 'src'), 'node_modules'],
    extensions: ['.md', '']
  },
  module: {
    loaders: [
      {
        test: /\.md$/,
        loader: 'book'
      },
      {
        test: /\.(png)$/,
        loader: 'file?name=[name].[ext]'
      }
    ]
  }
}
