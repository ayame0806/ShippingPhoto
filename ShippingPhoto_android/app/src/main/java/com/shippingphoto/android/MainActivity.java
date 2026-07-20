package com.shippingphoto.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setGravity(Gravity.CENTER);
        root.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(24);
        root.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("出貨拍照 Android 版");
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);

        TextView status = new TextView(this);
        status.setTextSize(16);
        status.setGravity(Gravity.CENTER);
        status.setText("廠商資料載入中");

        root.addView(title);
        root.addView(status);
        setContentView(root);

        status.setText("已載入廠商資料：" + countVendorRows() + " 筆");
    }

    private int countVendorRows() {
        int count = 0;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(getAssets().open("vendors.csv"), StandardCharsets.UTF_8))) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }
                if (!line.trim().isEmpty()) {
                    count += 1;
                }
            }
        } catch (IOException ignored) {
            return 0;
        }
        return count;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
