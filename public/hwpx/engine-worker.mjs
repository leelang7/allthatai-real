// 한글 양식 엔진(파이썬)을 화면과 다른 스레드에서 돌린다.
// ★ 화면 스레드에서 Pyodide 를 띄우면 중급 폰(CPU÷4)에서 '준비 중 N초' 표시가 9초 넘게 멈춰 고장 난 화면으로
//   보였고(파이썬 본체 기동 9.3s·import 5.2s·빈칸 찾기 2.4s 가 통째로 화면을 막았다), .hwp 변환(rhwp)도 파이썬이
//   다 뜰 때까지 줄을 섰다. 일꾼 스레드로 옮기면 화면은 계속 움직이고 변환은 기동과 겹친다.
// 메시지: {id, cmd:'boot'|'scan'|'fill', bytes?, answers?} → {id, ok, raw?, out?, err?}, 단계 표시는 {mark}
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/';
const ENGINE = ['profile_ref.py', 'form_tool.py', 'audit.py'];
const WHEEL = '/hwpx/python_hwpx-6.4.0-py3-none-any.whl';

let py = null, ready = null;
const mark = (m) => self.postMessage({ mark: m });

function boot() {
  if (py) return Promise.resolve(py);
  if (ready) return ready;
  ready = (async () => {
    // lxml 은 본체와 함께, 엔진 wheel·.py 는 그사이 미리 받아 둔다(micropip 없이 wheel 을 그대로 푼다)
    const wheelP = fetch(WHEEL).then((r) => r.arrayBuffer());
    const srcP = Promise.all(ENGINE.map((f) => fetch('/hwpx/' + f).then((r) => r.text())));
    const { loadPyodide } = await import(PYODIDE + 'pyodide.mjs');
    const _py = await loadPyodide({ indexURL: PYODIDE, packages: ['lxml'] });
    mark('pyodide');
    // 기본값은 작업 폴더라 import 가 안 된다 — site-packages 로 푼다
    const site = _py.runPython('import sysconfig; sysconfig.get_paths()["purelib"]');
    _py.unpackArchive(await wheelP, 'wheel', { extractDir: site });
    const srcs = await srcP;
    _py.FS.mkdir('/engine');
    ENGINE.forEach((f, i) => _py.FS.writeFile('/engine/' + f, srcs[i]));
    mark('unpacked');
    await _py.runPythonAsync('import sys, os\nsys.path.insert(0, "/engine")\nos.chdir("/engine")\nimport form_tool, audit');
    mark('imported');
    py = _py;
    return py;
  })();
  // 실패(네트워크 끊김 등)한 준비를 붙잡고 있으면 다시 시도할 길이 없다
  ready.catch(() => { ready = null; });
  return ready;
}

const SCAN = [
  'import io, json, sys',
  'import form_tool as FT',
  // mimetype 빠진 HWPX 는 고쳐 열고, .hwpx 로 이름만 바꾼 워드 파일은 DOCX_FILE 로 알린다(화면이 한국어로 바꾼다)
  'FT.repair_package("form.hwpx")',
  '_o = sys.stdout; sys.stdout = io.StringIO()',
  'try:',
  '    _r = FT.scan("form.hwpx")',
  'finally:',
  '    sys.stdout = _o',
  'json.dumps(_r, ensure_ascii=False)',
].join('\n');

const FILL = [
  'import io, json, sys',
  'import form_tool as FT, audit',
  '_a = json.load(open("ans.json", encoding="utf-8"))',
  '_d = _a.pop("_drop", None)',                                                     // 작성요령 상자 지우기
  '_a = {k: v for k, v in _a.items() if not k.startswith("_")}',
  '_o = sys.stdout; sys.stdout = io.StringIO()',
  'try:',
  '    FT.fill("form.hwpx", _a, "out.hwpx")',
  // ★ 검사 먼저, 지우기는 그 뒤 — 표를 지우면 뒤 표 번호가 밀려 검사가 엉뚱한 표끼리 대조했다(거짓 A14)
  '    _f = audit.audit("out.hwpx", base="form.hwpx")',
  '    if _d:',
  '        FT.drop_boxes("out.hwpx", _d)',
  'finally:',
  '    sys.stdout = _o',
  'json.dumps([x.as_dict() for x in _f], ensure_ascii=False)',
].join('\n');

self.onmessage = async (e) => {
  const { id, cmd } = e.data || {};
  try {
    const p = await boot();
    if (cmd === 'boot') {
      self.postMessage({ id, ok: true });
    } else if (cmd === 'scan') {
      p.FS.writeFile('/engine/form.hwpx', e.data.bytes);
      const raw = await p.runPythonAsync(SCAN);
      self.postMessage({ id, ok: true, raw });
    } else if (cmd === 'fill') {
      p.FS.writeFile('/engine/ans.json', e.data.answers);
      const raw = await p.runPythonAsync(FILL);
      const out = p.FS.readFile('/engine/out.hwpx');
      self.postMessage({ id, ok: true, raw, out }, [out.buffer]);
    } else {
      throw new Error('unknown command ' + cmd);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, err: String((err && err.message) || err) });
  }
};
