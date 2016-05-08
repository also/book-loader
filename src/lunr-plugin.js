const cheerio = require('cheerio');
const lunr = require('lunr');

module.exports = class LunrPlugin {
  apply(compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      const index = lunr(function() {
        this.ref('url');
        this.field('title', {boost: 10});
        this.field('body');
      });

      const docs = Object.create(null);

      Object.keys(compilation.assets).forEach((url) => {
        if (url.match(/\.html$/)) {
          const {$, title} = compilation.assets[url];

          if ($) {
            const body = $.root().text();

            docs[url] = {url, title};
            index.add({url, title, body});
          }
        }
      });

      const source = JSON.stringify({index, docs});

      compilation.assets['search-index.json'] = {
        source: () => source,
        size: () => source.length
      };

      callback();
    });
  }
};
