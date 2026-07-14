const esbuild = require('esbuild');

// Node.js 내장 모듈을 브라우저 환경에서 에러가 나지 않도록 mock 처리하거나 간단히 polyfill 하는 플러그인
const mockPlugin = {
  name: 'node-mock-plugin',
  setup(build) {
    // npm buffer 패키지를 정상 리졸브하도록 지정 (built-in과 충돌 방지)
    build.onResolve({ filter: /^buffer$/ }, args => {
      try {
        const path = require('path');
        const bufferPath = require.resolve('buffer/index.js', { paths: [args.resolveDir] });
        return { path: bufferPath };
      } catch (e) {
        return null;
      }
    });

    // fs/promises, node:events, sharp, onnxruntime-node 등 브라우저에서 불필요하거나 실행 불가한 노드 의존성들을 모킹
    build.onResolve({ filter: /^(node:)?(fs|path|child_process|crypto|os|http|https|net|tls|dns|zlib|stream|module|events|worker_threads|sharp|onnxruntime-node|@hyzyla\/pdfium|@huggingface\/transformers)(\/.*)?$/ }, args => {
      return { path: args.path, namespace: 'mock-node-ns' };
    });

    build.onLoad({ filter: /.*/, namespace: 'mock-node-ns' }, args => {
      let contents = `
        const emptyFn = () => {};
        const handler = {
          get: (target, prop) => {
            if (prop === 'default') return proxyObj;
            if (prop === '__esModule') return true;
            return proxyObj;
          }
        };
        const proxyObj = new Proxy(emptyFn, handler);
        module.exports = proxyObj;
      `;

      if (args.path === 'module' || args.path === 'node:module') {
        contents = `
          const emptyFn = () => ({});
          module.exports = {
            createRequire: () => emptyFn,
            default: {
              createRequire: () => emptyFn
            }
          };
        `;
      }

      if (args.path === 'path' || args.path === 'node:path') {
        // path 모듈의 브라우저용 초경량 polyfill
        contents = `
          module.exports = {
            resolve: (...args) => args.join('/').replace(/\\\\/g, '/'),
            normalize: (p) => p.replace(/\\\\/g, '/'),
            join: (...args) => args.join('/').replace(/\\\\/g, '/'),
            extname: (p) => {
              const idx = p.lastIndexOf('.');
              return idx !== -1 ? p.substring(idx) : '';
            },
            basename: (p, ext) => {
              let b = p.substring(p.lastIndexOf('/') + 1);
              if (ext && b.endsWith(ext)) {
                b = b.substring(0, b.length - ext.length);
              }
              return b;
            }
          };
        `;
      }

      return { contents, loader: 'js' };
    });
  }
};

esbuild.build({
  entryPoints: ['extension/popup_dev.js'],
  bundle: true,
  outfile: 'extension/popup.js',
  platform: 'browser',
  define: {
    global: 'window',
    'process.env.NODE_ENV': '"production"',
    'process.platform': '"browser"'
  },
  inject: ['./buffer-polyfill.js'],
  plugins: [mockPlugin],
  minify: false, // 디버깅 편의를 위해 일단 false로 지정, 정상 작동 확인 시 압축해도 됨
  sourcemap: true,
}).then(() => {
  console.log('🎉 popup.js 번들링 완료!');
}).catch((err) => {
  console.error('❌ 빌드 에러:', err);
  process.exit(1);
});
