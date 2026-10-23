require('./register.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const React = require('react'),
  { renderToString } = require('react-dom/server');
test('new hooks render without browser globals and use explicit server snapshots', () => {
  const { useMediaQuery } = require('../src/react/useMediaQuery.ts');
  const { useUrlState } = require('../src/react/useUrlState.ts');
  const useKeyboard = require('../src/hooks/useKeyboard.tsx').default;
  const schema = {
    page: {
      defaultValue: 1,
      parse: v => Number(v[0]),
      serialize: n => [String(n)],
    },
  };
  const adapter = {
    getSearch() {
      throw Error('client read during SSR');
    },
    subscribe() {
      throw Error('client subscribe during SSR');
    },
    setSearch() {},
  };
  function App() {
    useKeyboard('ctrl+k', () => {});
    const match = useMediaQuery('print', { defaultMatches: true });
    const url = useUrlState(schema, adapter, { serverSearch: '?page=3' });
    return JSON.stringify({ match, page: url.state.page });
  }
  assert.equal(
    renderToString(React.createElement(App)),
    '{&quot;match&quot;:true,&quot;page&quot;:3}'
  );
});
