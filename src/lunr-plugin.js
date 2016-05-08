const cheerio = require('cheerio');
const lunr = require('lunr');

module.exports = class LunrPlugin {
  apply(compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      const index = lunr(function() {
        this.ref('url');
        this.field('body');
      });

      const docs = Object.create(null);

      Object.keys(compilation.assets).forEach((k) => {
        if (k.match(/\.html$/)) {
          const $ = cheerio.load(compilation.assets[k].source());
          const main = $('main');
          if (main) {
            const doc = {
              url: k,
              body: main.text()
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
