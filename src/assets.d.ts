declare module '*.css';

/** Injected by webpack's DefinePlugin: what this build was made from. */
declare const BUILD_INFO: { commit: string | null; runUrl: string | null; time: string };

declare module '*.wasm' {
  const url: string;
  export default url;
}
