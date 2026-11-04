import readXlsxFile, { readSheetNames } from "read-excel-file/web-worker";
import { lerCsvCarteira, hashCarteira, lerAbaCarteira } from "./mimo-carteira-importacao";
self.onmessage = async (e: MessageEvent<File>) => {
  try {
    const f = e.data;
    const bytes = await f.arrayBuffer();
    const hash = await hashCarteira(bytes);
    let rows: unknown[][];
    if (f.name.toLowerCase().endsWith(".csv"))
      rows = lerCsvCarteira(new TextDecoder().decode(bytes));
    else {
      const sheets = await readSheetNames(bytes);
      rows = await lerAbaCarteira(sheets, (sheet) => readXlsxFile(bytes, { sheet }));
    }
    self.postMessage({ rows, hash });
  } catch (error) {
    self.postMessage({ erro: error instanceof Error ? error.message : "Falha ao ler arquivo." });
  }
};
