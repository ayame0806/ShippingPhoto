package com.shippingphoto.android;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.OrientationEventListener;
import android.view.Surface;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.documentfile.provider.DocumentFile;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class MainActivity extends ComponentActivity {
    private static final String PREFS = "shipping_photo_settings";
    private static final int REQ_CAMERA = 10;

    private final List<VendorGroup> groups = new ArrayList<>();
    private final List<Button> kindButtons = new ArrayList<>();
    private final Executor mainExecutor = command -> new Handler(Looper.getMainLooper()).post(command);

    private SharedPreferences prefs;
    private PreviewView previewView;
    private Spinner typeSpinner;
    private Spinner vendorSpinner;
    private EditText dateInput;
    private TextView statusText;
    private TextView folderText;
    private Button captureButton;
    private Button zipButton;
    private ImageCapture imageCapture;
    private OrientationEventListener orientationListener;
    private ActivityResultLauncher<Uri> pickPhotoFolder;
    private ActivityResultLauncher<Uri> pickZipFolder;

    private String selectedType = "";
    private String selectedVendor = "";
    private String selectedKind = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        registerFolderPickers();
        loadVendors();
        buildUi();
        restoreSelection();
        refreshTypeSpinner();
        refreshFolders();
        updateKindButtons();
        requestCameraIfNeeded();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (orientationListener != null) {
            orientationListener.enable();
        }
    }

    @Override
    protected void onStop() {
        if (orientationListener != null) {
            orientationListener.disable();
        }
        super.onStop();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else if (requestCode == REQ_CAMERA) {
            setStatus("相機權限未開啟");
        }
    }

    private void registerFolderPickers() {
        pickPhotoFolder = registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), uri -> {
            if (uri != null) {
                persistFolder("photoUri", uri);
                setStatus("拍照資料夾已設定");
                refreshFolders();
            }
        });
        pickZipFolder = registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), uri -> {
            if (uri != null) {
                persistFolder("zipUri", uri);
                setStatus("ZIP 資料夾已設定");
                refreshFolders();
            }
        });
    }

    private void persistFolder(String key, Uri uri) {
        int flags = android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                | android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (RuntimeException ignored) {
            // Some providers grant access without a persistable flag. Keep the URI and report failures on write.
        }
        prefs.edit().putString(key, uri.toString()).apply();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(246, 247, 244));

        LinearLayout topbar = new LinearLayout(this);
        topbar.setOrientation(LinearLayout.VERTICAL);
        topbar.setPadding(dp(18), dp(14), dp(18), dp(12));
        topbar.setBackgroundColor(Color.rgb(23, 91, 69));
        TextView title = new TextView(this);
        title.setText("出貨拍照");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER_VERTICAL);
        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(222, 243, 234));
        statusText.setTextSize(14);
        statusText.setText("準備中");
        topbar.addView(title);
        topbar.addView(statusText);
        root.addView(topbar);

        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        root.addView(previewView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1.25f
        ));

        ScrollView scroll = new ScrollView(this);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(14), dp(12), dp(14), dp(16));
        scroll.addView(panel);
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        captureButton = primaryButton("請選種類");
        captureButton.setOnClickListener(v -> takePhoto());
        panel.addView(captureButton, matchWrap());

        LinearLayout kinds = new LinearLayout(this);
        kinds.setOrientation(LinearLayout.HORIZONTAL);
        kinds.setGravity(Gravity.CENTER);
        kinds.setPadding(0, dp(8), 0, dp(10));
        for (int i = 1; i <= 4; i += 1) {
            Button button = secondaryButton(String.valueOf(i));
            String kind = String.valueOf(i);
            button.setOnClickListener(v -> {
                selectedKind = kind;
                prefs.edit().putString("kind", selectedKind).apply();
                updateKindButtons();
            });
            kindButtons.add(button);
            kinds.addView(button, new LinearLayout.LayoutParams(0, dp(48), 1));
        }
        panel.addView(kinds, matchWrap());

        LinearLayout spinners = new LinearLayout(this);
        spinners.setOrientation(LinearLayout.HORIZONTAL);
        typeSpinner = new Spinner(this);
        vendorSpinner = new Spinner(this);
        spinners.addView(typeSpinner, new LinearLayout.LayoutParams(0, dp(52), 0.9f));
        spinners.addView(vendorSpinner, new LinearLayout.LayoutParams(0, dp(52), 1.3f));
        panel.addView(spinners, matchWrap());

        typeSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
            if (position >= 0 && position < groups.size()) {
                selectedType = groups.get(position).type;
                prefs.edit().putString("type", selectedType).apply();
                refreshVendorSpinner("");
            }
        }));
        vendorSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
            VendorGroup group = currentGroup();
            if (group != null && position >= 0 && position < group.vendors.size()) {
                selectedVendor = group.vendors.get(position).name;
                selectedKind = "";
                prefs.edit().putString("vendor", selectedVendor).remove("kind").apply();
                updateKindButtons();
            }
        }));

        LinearLayout dateRow = new LinearLayout(this);
        dateRow.setOrientation(LinearLayout.HORIZONTAL);
        dateInput = new EditText(this);
        dateInput.setSingleLine(true);
        dateInput.setText(todayDate());
        dateInput.setTextSize(16);
        Button today = secondaryButton("今天");
        today.setOnClickListener(v -> dateInput.setText(todayDate()));
        dateRow.addView(dateInput, new LinearLayout.LayoutParams(0, dp(52), 1));
        dateRow.addView(today, new LinearLayout.LayoutParams(dp(86), dp(52)));
        panel.addView(dateRow, matchWrap());

        Button photoFolder = secondaryButton("設定拍照資料夾");
        photoFolder.setOnClickListener(v -> pickPhotoFolder.launch(null));
        Button zipFolder = secondaryButton("設定 ZIP 資料夾");
        zipFolder.setOnClickListener(v -> pickZipFolder.launch(null));
        panel.addView(photoFolder, matchWrap());
        panel.addView(zipFolder, matchWrap());

        zipButton = secondaryButton("壓縮拍照資料夾 JPG");
        zipButton.setOnClickListener(v -> createZip());
        panel.addView(zipButton, matchWrap());

        folderText = new TextView(this);
        folderText.setTextSize(13);
        folderText.setTextColor(Color.rgb(65, 72, 68));
        folderText.setPadding(0, dp(8), 0, 0);
        panel.addView(folderText, matchWrap());

        setContentView(root);
    }

    private void refreshTypeSpinner() {
        List<String> names = new ArrayList<>();
        for (VendorGroup group : groups) {
            names.add(group.type);
        }
        typeSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names));
        int selected = Math.max(0, indexOfType(selectedType));
        typeSpinner.setSelection(selected, false);
        selectedType = groups.isEmpty() ? "" : groups.get(selected).type;
        refreshVendorSpinner(selectedVendor);
    }

    private void refreshVendorSpinner(String preferredVendor) {
        VendorGroup group = currentGroup();
        List<String> names = new ArrayList<>();
        if (group != null) {
            for (Vendor vendor : group.vendors) {
                names.add(vendor.name);
            }
        }
        vendorSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names));
        int selected = 0;
        if (group != null) {
            for (int i = 0; i < group.vendors.size(); i += 1) {
                if (group.vendors.get(i).name.equals(preferredVendor)) {
                    selected = i;
                    break;
                }
            }
            selectedVendor = group.vendors.isEmpty() ? "" : group.vendors.get(selected).name;
            vendorSpinner.setSelection(selected, false);
        }
        updateKindButtons();
    }

    private void restoreSelection() {
        selectedType = prefs.getString("type", groups.isEmpty() ? "" : groups.get(0).type);
        selectedVendor = prefs.getString("vendor", "");
        selectedKind = prefs.getString("kind", "");
    }

    private void updateKindButtons() {
        int max = currentVendorMax();
        if (!selectedKind.isEmpty() && Integer.parseInt(selectedKind) > max) {
            selectedKind = "";
        }
        for (int i = 0; i < kindButtons.size(); i += 1) {
            int kind = i + 1;
            Button button = kindButtons.get(i);
            button.setVisibility(kind <= max ? View.VISIBLE : View.GONE);
            boolean selected = String.valueOf(kind).equals(selectedKind);
            button.setTextColor(selected ? Color.WHITE : Color.rgb(23, 91, 69));
            button.setBackgroundColor(selected ? Color.rgb(23, 91, 69) : Color.rgb(232, 240, 234));
        }
        captureButton.setText(selectedKind.isEmpty() ? "請選種類" : "拍照儲存");
        captureButton.setEnabled(!selectedKind.isEmpty());
    }

    private void refreshFolders() {
        String photo = prefs.getString("photoUri", "");
        String zip = prefs.getString("zipUri", "");
        String photoState = photo.isEmpty() ? "未設定" : "已設定";
        String zipState = zip.isEmpty() ? "未設定" : "已設定";
        folderText.setText("拍照資料夾：" + photoState + "\nZIP 資料夾：" + zipState);
        zipButton.setEnabled(!photo.isEmpty() && !zip.isEmpty());
    }

    private void requestCameraIfNeeded() {
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(this);
        cameraProviderFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = cameraProviderFuture.get();
                Preview preview = new Preview.Builder()
                        .setTargetRotation(currentRotation())
                        .build();
                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .setJpegQuality(95)
                        .setTargetRotation(currentRotation())
                        .build();
                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                setupOrientationListener();
                setStatus("相機已啟動");
            } catch (Exception error) {
                setStatus("相機啟動失敗");
            }
        }, mainExecutor);
    }

    private void setupOrientationListener() {
        if (orientationListener != null) {
            orientationListener.disable();
        }
        orientationListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int orientation) {
                if (orientation == ORIENTATION_UNKNOWN || imageCapture == null) {
                    return;
                }
                imageCapture.setTargetRotation(rotationFromOrientation(orientation));
            }
        };
        orientationListener.enable();
    }

    private void takePhoto() {
        if (imageCapture == null) {
            setStatus("相機尚未就緒");
            return;
        }
        DocumentFile folder = treeFromPref("photoUri");
        if (folder == null || !folder.canWrite()) {
            setStatus("請先設定可寫入的拍照資料夾");
            return;
        }
        if (selectedVendor.isEmpty() || selectedKind.isEmpty()) {
            setStatus("請先選廠商與種類");
            return;
        }

        String filename = photoFilename();
        DocumentFile imageFile = folder.createFile("image/jpeg", filename);
        if (imageFile == null) {
            setStatus("建立照片檔失敗");
            return;
        }

        try {
            OutputStream output = getContentResolver().openOutputStream(imageFile.getUri(), "w");
            if (output == null) {
                setStatus("無法寫入照片檔");
                return;
            }
            ImageCapture.OutputFileOptions options = new ImageCapture.OutputFileOptions.Builder(output).build();
            captureButton.setEnabled(false);
            setStatus("拍照儲存中");
            imageCapture.takePicture(options, mainExecutor, new ImageCapture.OnImageSavedCallback() {
                @Override
                public void onImageSaved(ImageCapture.OutputFileResults outputFileResults) {
                    closeQuietly(output);
                    setStatus("已儲存 " + filename);
                    updateKindButtons();
                }

                @Override
                public void onError(ImageCaptureException exception) {
                    closeQuietly(output);
                    imageFile.delete();
                    setStatus("拍照失敗");
                    updateKindButtons();
                }
            });
        } catch (Exception error) {
            imageFile.delete();
            setStatus("拍照儲存失敗");
            updateKindButtons();
        }
    }

    private void createZip() {
        DocumentFile photoFolder = treeFromPref("photoUri");
        DocumentFile zipFolder = treeFromPref("zipUri");
        if (photoFolder == null || zipFolder == null || !zipFolder.canWrite()) {
            setStatus("請先設定拍照與 ZIP 資料夾");
            return;
        }
        List<DocumentFile> jpgs = jpgFiles(photoFolder);
        if (jpgs.isEmpty()) {
            setStatus("拍照資料夾沒有 JPG");
            return;
        }

        String zipName = "出貨照片_" + timestamp(new Date()) + ".zip";
        DocumentFile zipFile = zipFolder.createFile("application/zip", zipName);
        if (zipFile == null) {
            setStatus("建立 ZIP 檔失敗");
            return;
        }

        zipButton.setEnabled(false);
        setStatus("壓縮中：" + jpgs.size() + " 張");
        new Thread(() -> {
            try (OutputStream raw = getContentResolver().openOutputStream(zipFile.getUri(), "w");
                 ZipOutputStream zip = new ZipOutputStream(raw)) {
                Set<String> usedNames = new HashSet<>();
                byte[] buffer = new byte[1024 * 64];
                for (DocumentFile file : jpgs) {
                    String entryName = uniqueName(file.getName(), usedNames);
                    zip.putNextEntry(new ZipEntry(entryName));
                    try (InputStream input = getContentResolver().openInputStream(file.getUri())) {
                        int read;
                        while (input != null && (read = input.read(buffer)) > 0) {
                            zip.write(buffer, 0, read);
                        }
                    }
                    zip.closeEntry();
                }
                mainExecutor.execute(() -> {
                    setStatus("已產生 " + zipName);
                    zipButton.setEnabled(true);
                });
            } catch (Exception error) {
                zipFile.delete();
                mainExecutor.execute(() -> {
                    setStatus("壓縮失敗，請分批處理");
                    zipButton.setEnabled(true);
                });
            }
        }).start();
    }

    private void loadVendors() {
        groups.clear();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(getAssets().open("vendors.csv"), StandardCharsets.UTF_8))) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }
                String[] cells = line.split(",", -1);
                if (cells.length < 2) {
                    continue;
                }
                String type = cells[0].trim();
                String vendor = cells[1].trim();
                int max = cells.length >= 3 ? parseMax(cells[2]) : 3;
                if (type.isEmpty() || vendor.isEmpty()) {
                    continue;
                }
                VendorGroup group = groupByType(type);
                if (group == null) {
                    group = new VendorGroup(type);
                    groups.add(group);
                }
                group.vendors.add(new Vendor(vendor, max));
            }
        } catch (IOException ignored) {
        }
    }

    private DocumentFile treeFromPref(String key) {
        String value = prefs.getString(key, "");
        if (value.isEmpty()) {
            return null;
        }
        return DocumentFile.fromTreeUri(this, Uri.parse(value));
    }

    private List<DocumentFile> jpgFiles(DocumentFile folder) {
        List<DocumentFile> files = new ArrayList<>();
        for (DocumentFile file : folder.listFiles()) {
            String name = file.getName();
            if (file.isFile() && name != null && name.toLowerCase(Locale.US).matches(".*\\.jpe?g$")) {
                files.add(file);
            }
        }
        Collections.sort(files, (a, b) -> String.valueOf(a.getName()).compareToIgnoreCase(String.valueOf(b.getName())));
        return files;
    }

    private String photoFilename() {
        String date = dateInput.getText().toString().trim();
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) {
            date = todayDate();
            dateInput.setText(date);
        }
        String compactDate = date.replace("-", "");
        String time = new SimpleDateFormat("HHmmss", Locale.US).format(new Date());
        return cleanPart(selectedVendor) + "_" + cleanPart(selectedKind) + "_" + compactDate + time + ".jpg";
    }

    private String timestamp(Date date) {
        return new SimpleDateFormat("yyyyMMddHHmmss", Locale.US).format(date);
    }

    private String todayDate() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private String uniqueName(String original, Set<String> usedNames) {
        String safeName = cleanPart(original == null || original.isEmpty() ? "photo.jpg" : original);
        int dot = safeName.lastIndexOf(".");
        String base = dot > 0 ? safeName.substring(0, dot) : safeName;
        String ext = dot > 0 ? safeName.substring(dot) : ".jpg";
        String candidate = safeName;
        int counter = 2;
        while (usedNames.contains(candidate.toLowerCase(Locale.US))) {
            candidate = base + " (" + counter + ")" + ext;
            counter += 1;
        }
        usedNames.add(candidate.toLowerCase(Locale.US));
        return candidate;
    }

    private String cleanPart(String value) {
        return value == null ? "" : value.trim().replaceAll("[\\\\/:*?\"<>|]", "-").replaceAll("\\s+", " ");
    }

    private int currentRotation() {
        return previewView != null && previewView.getDisplay() != null ? previewView.getDisplay().getRotation() : Surface.ROTATION_0;
    }

    private int rotationFromOrientation(int orientation) {
        if (orientation >= 45 && orientation < 135) {
            return Surface.ROTATION_270;
        }
        if (orientation >= 135 && orientation < 225) {
            return Surface.ROTATION_180;
        }
        if (orientation >= 225 && orientation < 315) {
            return Surface.ROTATION_90;
        }
        return Surface.ROTATION_0;
    }

    private VendorGroup currentGroup() {
        VendorGroup group = groupByType(selectedType);
        return group != null ? group : (groups.isEmpty() ? null : groups.get(0));
    }

    private VendorGroup groupByType(String type) {
        for (VendorGroup group : groups) {
            if (group.type.equals(type)) {
                return group;
            }
        }
        return null;
    }

    private int indexOfType(String type) {
        for (int i = 0; i < groups.size(); i += 1) {
            if (groups.get(i).type.equals(type)) {
                return i;
            }
        }
        return -1;
    }

    private int currentVendorMax() {
        VendorGroup group = currentGroup();
        if (group == null) {
            return 3;
        }
        for (Vendor vendor : group.vendors) {
            if (vendor.name.equals(selectedVendor)) {
                return vendor.max;
            }
        }
        return 3;
    }

    private int parseMax(String value) {
        try {
            int max = Integer.parseInt(value.trim());
            return Math.max(1, Math.min(4, max));
        } catch (NumberFormatException ignored) {
            return 3;
        }
    }

    private Button primaryButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(20);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setBackgroundColor(Color.rgb(31, 122, 85));
        return button;
    }

    private Button secondaryButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(16);
        button.setTextColor(Color.rgb(23, 91, 69));
        button.setAllCaps(false);
        button.setBackgroundColor(Color.rgb(232, 240, 234));
        return button;
    }

    private LinearLayout.LayoutParams matchWrap() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(8));
        return params;
    }

    private void setStatus(String message) {
        statusText.setText(message);
    }

    private void closeQuietly(OutputStream output) {
        try {
            output.close();
        } catch (IOException ignored) {
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private interface SelectionCallback {
        void onSelected(int position);
    }

    private static final class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
        private final SelectionCallback callback;

        SimpleItemSelectedListener(SelectionCallback callback) {
            this.callback = callback;
        }

        @Override
        public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
            callback.onSelected(position);
        }

        @Override
        public void onNothingSelected(android.widget.AdapterView<?> parent) {
        }
    }

    private static final class VendorGroup {
        final String type;
        final List<Vendor> vendors = new ArrayList<>();

        VendorGroup(String type) {
            this.type = type;
        }
    }

    private static final class Vendor {
        final String name;
        final int max;

        Vendor(String name, int max) {
            this.name = name;
            this.max = max;
        }
    }
}
