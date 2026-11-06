
function doGet(e) {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("API_KEY");

  const receivedKey = e.parameter.key;

  if (!apiKey || receivedKey !== apiKey) {
    return ContentService
      .createTextOutput(JSON.stringify({
        error: "Yetkisiz erişim"
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("products");

  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  const products = rows.map(row => {
    const product = {};

    headers.forEach((header, i) => {
      product[header] = row[i];
    });

    return product;
  });

  return ContentService
    .createTextOutput(JSON.stringify(products))
    .setMimeType(ContentService.MimeType.JSON);
}




function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    const apiKey = PropertiesService
      .getScriptProperties()
      .getProperty("API_KEY");

    const data = JSON.parse(e.postData.contents);

    if (!apiKey || e.parameter.key !== apiKey) {      
      return jsonResponse({ success: false, error: "Yetkisiz erişim" });
    }

    const operation = data.operation;
    const sku = String(data.sku || "").trim().toUpperCase();
    const quantity = Number(data.quantity);

    if (!["decrease", "increase", "set"].includes(operation)) {
      return jsonResponse({ success: false, error: "Geçersiz işlem" });
    }

    if (!Number.isSafeInteger(quantity) || quantity < 0 ||
        (operation !== "set" && quantity === 0)) {
      return jsonResponse({ success: false, error: "Geçersiz miktar" });
    }

    lock.waitLock(10000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const products = ss.getSheetByName("products");
    const movements = ss.getSheetByName("movements");

    if (!products || !movements) {
      throw new Error("Gerekli tablolar bulunamadı");
    }

    const rows = products.getDataRange().getValues();
    const index = rows.findIndex(
      (row, i) => i > 0 && String(row[0]).trim().toUpperCase() === sku
    );

    if (index === -1) {
      return jsonResponse({ success: false, error: "Ürün bulunamadı" });
    }

    const before = Number(rows[index][2]);
    if (!Number.isSafeInteger(before) || before < 0) {
      throw new Error("Mevcut stok değeri geçersiz");
    }

    let after;

    if (operation === "decrease") after = before - quantity;
    if (operation === "increase") after = before + quantity;
    if (operation === "set") after = quantity;

    if (!Number.isSafeInteger(after) || after < 0) {
      return jsonResponse({
        success: false,
        error: "Yetersiz stok veya geçersiz sonuç",
        stock: before
      });
    }

    products.getRange(index + 1, 3).setValue(after);
    SpreadsheetApp.flush();

    movements.appendRow([
      operation,
      sku,
      quantity,
      before,
      after,
      "success",
      String(data.source_text || "")
    ]);

    return jsonResponse({
      success: true,
      sku: sku,
      product_name: rows[index][1],
      before: before,
      after: after
    });

  } catch (error) {
    return jsonResponse({ success: false, error: String(error.message) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
