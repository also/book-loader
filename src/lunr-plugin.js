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

      Object.keys(compilation.assets).forEach((k) => {
        if (k.match(/\.html$/)) {
          const asset = compilation.assets[k];
          const $ = asset.$;
          if ($) {
            const body = $.root().text();

            const doc = {
              url: k,
              title: asset.title,
              body
            };
            docs[k] = doc;
            index.add(doc);
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
