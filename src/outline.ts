type Node = {
  type: string;
  children: Node[];
  simple?: boolean;
  list: boolean;
  elt: any;
};

export function transformToc($) {
  function readToc(elt): Node[] {
    if (elt.type === 'comment') {
      return [];
    }

    const children: Node[] = [];

    const $elt = $(elt);
    $elt.contents().each((i, child) => {
      children.push(...readToc(child));
    });

    const simpleChildren = children.every(({ simple }) => !!simple);
    const listChildren = children.some(({ list }) => list);
    let html = simpleChildren ? $elt.html() || elt.data : null;

    function result(opts): Node[] {
      const base: any = { type: opts.type || elt.tagName, list: listChildren };
      // elt is non-enumerable so the result is easy to stringify
      Object.defineProperty(base, 'elt', { enumerable: false, value: elt });
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
        simple: true,
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
        let firstListIndex = children.findIndex(({ list }) => list);
        if (firstListIndex === -1) {
          firstListIndex = children.length;
        }

        const title = children.slice(0, firstListIndex);
        const titleElts = title.map(({ elt }) => elt);

        const titleText = $.text(titleElts)
          .replace(/\s+/g, ' ')
          .trim();
        // TODO this is a hack to get cheerio to find an a tag at the root or
        // a child of any of the titleElts. It normally only searches children.
        const url = $('a', [{ children: titleElts }]).attr('href');

        const listChildren = children.slice(firstListIndex);
        const entries: Node[] = [];
        listChildren.forEach(child => {
          if (child.type === 'list') {
            entries.push(...child.children);
          } else {
            throw new Error(
              `Found unexpected "${
                child.elt.tagName
              }" tag after list in "${titleText}": ${$.html(child.elt)}`
            );
          }
        });

        return result({
          type: 'entry',
          title,
          titleText,
          url,
          children: entries,
        });
      }
    } else if (elt.tagName === 'a') {
      return result({
        attrs: elt.attribs,
      });
    } else {
      return result({
        simple: simpleChildren,
        attrs: elt.attribs,
      });
    }
  }
  const outline = readToc($.root().get(0))[0];
  return outline;
}

export function generateBreadcrumbs(outline) {
  const result = new Map();
  const recurse = (node, path) => {
    if (node.type === 'entry') {
      path = [...path, { title: node.titleText, url: node.url }];
      if (node.url != null) {
        const entries = result.get(node.url) || [];
        entries.push(path);
        result.set(node.url, entries);
      }
    }
    if (node.children) {
      node.children.forEach(child => recurse(child, path));
    }
  };

  recurse(outline, []);

  return result;
}
