import { resolveOkruReplay } from './src/main/services/okru-resolver.ts';
const id = '16060681816748';
console.log('Testing resolveOkruReplay for ok.ru/video/'+id);
try {
  const url = await resolveOkruReplay('https://ok.ru/video/'+id);
  console.log('RESOLVED:', url);
  if (url.includes('.m3u8') && url.includes('cmd=videoPlayerCdn')) {
    console.log('PASS: got .m3u8 URL with cmd=videoPlayerCdn');
  } else {
    console.log('FAIL: unexpected URL format');
  }
} catch(e) {
  console.log('ERROR:', e.message);
}
