# Shipping Photo

## 專案結構

- `ShippingPhoto_web/`：目前手機網頁版。
- `ShippingPhoto_android/`：Android APK 專用版本。

## Android 建置

Android 版目前包含：

- CameraX 相機預覽與拍照。
- 依 `廠商_種類_日期時間.jpg` 命名。
- 類型/廠商由內建 `vendors.csv` 讀取。
- 廠商 `max` 會控制種類按鈕數量。
- 拍照資料夾與 ZIP 資料夾使用 Android 資料夾選擇器設定，重新開啟後保留。
- ZIP 會直接讀拍照資料夾內 JPG，保留原始檔名打包。

本機已設定 Android SDK 與 Gradle Wrapper。產生測試 APK：

```powershell
cd ShippingPhoto_android
.\gradlew.bat assembleDebug
```

輸出位置：

```text
ShippingPhoto_android/app/build/outputs/apk/debug/app-debug.apk
```

---

手機用出貨拍照工具。開啟網頁後會要求相機權限，選擇類型、廠商與種類後，拍照會下載成：

```text
廠商_種類_YYYYMMDDHHMMSS.jpg
```

例如：

```text
馗鼎_2_20260703105816.jpg
```

日期欄位預設為當天，也可以手動改成其他日期；檔名日期會使用欄位日期，時分秒使用拍照當下時間。

## 修改廠商清單

使用端不能編輯清單；開發端只要用 Excel 編輯 `vendors.csv`：

- `類型`：下拉式類型
- `廠商`：該類型底下的廠商
- `max`：種類按鈕最大值，只能是 `1`、`2`、`3`、`4`

例如 `max` 是 `3` 時，只顯示 `1 2 3`；`max` 是 `4` 時，顯示 `1 2 3 4`。

修改後提交並推送到 GitHub Pages 即可更新網站。

## 壓縮工具

頁面底部的壓縮工具可一次選取多張 `.jpg` / `.jpeg` 照片，並打包下載成：

```text
出貨照片_YYYYMMDDHHMMSS.zip
```

JPG 本身已經是壓縮格式，所以 ZIP 主要用於把多張照片整理成一個檔案。
