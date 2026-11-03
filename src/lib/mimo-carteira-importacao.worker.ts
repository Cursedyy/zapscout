import readXlsxFile, { readSheetNames } from "read-excel-file/web-worker";
import { lerCsvCarteira, hashCarteira } from "./mimo-carteira-importacao";
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
      const sheet = sheets.includes("Base Potencial") ? "Base Potencial" : sheets[0];
      rows = await readXlsxFile(bytes, { sheet });
    }
    self.postMessage({ rows, hash });
  } catch (error) {
    self.postMessage({ erro: error instanceof Error ? error.message : "Falha ao ler arquivo." });
  }
};
