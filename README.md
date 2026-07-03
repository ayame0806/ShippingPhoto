# Shipping Photo

手機用出貨拍照工具。開啟網頁後會要求相機權限，選擇類型、廠商與種類後，拍照會下載成：

```text
廠商_種類_YYYYMMDDHHMMSS.jpg
```

例如：

```text
馗鼎_2_20260703105816.jpg
```

## 修改廠商清單

使用端不能編輯清單；開發端只要改 `vendors.json`：

- `defaultType`：預設類型
- `defaultVendor`：預設廠商
- `defaultKind`：預設種類，只能是 `1`、`2`、`3`、`4`
- `types[].vendors`：各類型底下的廠商

修改後提交並推送到 GitHub Pages 即可更新網站。
