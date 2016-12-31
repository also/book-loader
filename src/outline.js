const cheerio = require('cheerio');


module.exports = function transformToc(toc) {
  const $ = cheerio.load(toc);

  function readToc(elt) {
    if (elt.type === 'comment') {
      return [];
    }

    const children = [];

    const $elt = $(elt);
    $elt.contents().each((i, child) => {
      children.push(...readToc(child));
    });

    const simpleChildren = children.every(({simple}) => simple);
    const listChildren = children.some(({list}) => list);
    let html = simpleChildren ? $elt.html() || elt.data : null;

    function result(opts) {
      const base = {type: opts.type || elt.tagName, list: listChildren};
      if (!simpleChildren) {
        base.children = children;
      } else {
        base.html = html;
      }

      return [Object.assign(base, opts)];
    }

    if (elt.tagName === 'p') {
      return children;
    } else if (elt.type === 'text') {
      if (html === '\n') {
        return [];
      }
      return result({
        type: 'text',
        simple: true
      });
    } else if (elt.tagName === 'ul') {
      return result({
        type: 'list',
        list: true,
      });
    } else if (elt.tagName === 'li') {
      if (children.length === 0) {
        // wat
        return [];
      } else {
        // the title is all the non-list children at the beginning
        let firstListIndex = children.findIndex(({list}) => list);
        if (firstListIndex === -1) {
          firstListIndex = children.length;
        }
        const title = children.slice(0, firstListIndex);
        const listChildren = children.slice(firstListIndex);
        const entries = [];
        listChildren.forEach((child) => {
          if (child.type === 'list') {
            entries.push(...child.children);
          } else {
            throw new Error(`Don't know what to do with children ${$elt.html()}`);
          }
        });
        return result({
          type: 'entry',
          title,
          children: entries
        });
      }
    } else if (elt.tagName === 'a') {
      return result({
        attrs: elt.attribs
      });
    } else {
      return result({
        simple: simpleChildren,
        attrs: elt.attribs
      });
    }
  }
  const outline = readToc($.root().get(0))[0];
  return outline;
};
