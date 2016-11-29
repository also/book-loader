---
key: value
---
# Module Example

## This

<pre><%- require('!!raw-loader!./module-example.md') %></pre>

## Turns into this

<pre><%- require('raw-loader!./module-example.md') %></pre>
