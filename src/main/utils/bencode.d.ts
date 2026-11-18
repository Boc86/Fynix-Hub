declare module 'bencode' {
  function decode<T = any>(data: Buffer): T
  function encode<T = any>(data: T): Buffer
  function decodeFile<T = any>(path: string): Promise<T>
  export = { decode, encode, decodeFile }
}