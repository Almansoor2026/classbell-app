name: Build ClassBell APK
on:
  workflow_dispatch:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Create Capacitor project
        run: |
          cat > package.json <<'EOF'
          {
            "name": "classbell",
            "version": "1.0.0",
            "private": true,
            "dependencies": {
              "@capacitor/android": "6.1.2",
              "@capacitor/core": "6.1.2",
              "@capacitor/local-notifications": "6.1.0"
            },
            "devDependencies": {
              "@capacitor/cli": "6.1.2"
            }
          }
          EOF
          cat > capacitor.config.json <<'EOF'
          {
            "appId": "com.classbell.app",
            "appName": "ClassBell",
            "webDir": "www"
          }
          EOF
          npm install
      - name: Prepare web files
        run: |
          mkdir www
          cp index.html app.js sw.js manifest.json www/
          curl -sSL https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js -o www/supabase.js
          sed -i 's#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js#supabase.js#' www/index.html
          grep -c 'src="supabase.js"' www/index.html
      - name: Add Android and permissions
        run: |
          npx cap add android
          npx cap sync android
          sed -i 's#<application#<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>\n <uses-permission android:name="android.permission.USE_EXACT_ALARM"/>\n <uses-permission android:name="android.permission.VIBRATE"/>\n <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>\n <application#' android/app/src/main/AndroidManifest.xml
      - name: Build APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ github.run_number }}
          name: ClassBell v${{ github.run_number }}
          files: android/app/build/outputs/apk/debug/app-debug.apk
