const entry = require(BOOK_LOADER_DIR + '/entry');

module.exports = {
  render(page) {
    return entry.pages.render(entry.context, page);
  },
};
