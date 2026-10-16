package fr.newmannheim.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.text.InputType;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;

/**
 * NewMannheim dans une WebView plein écran : le site du serveur, tel quel (connexion par cookie, temps réel,
 * mises à jour sans republier l'APK).
 *
 * L'adresse du serveur est demandée au premier lancement et retenue. Retour à la racine de l'app : quitter
 * ou changer de serveur ; serveur injoignable : réessayer ou changer de serveur. Les liens vers d'autres
 * sites s'ouvrent dans le navigateur. La WebView ignore `window.print()` : le site imprime par
 * `NewMannheimApp.print(titre)` (frontend/src/lib/print.ts), qui ouvre l'impression d'Android (ou PDF).
 */
public class MainActivity extends Activity {
    private static final String PREFS = "newmannheim";
    private static final String SERVER_URL = "server_url";

    private WebView webView;
    private SharedPreferences prefs;
    private boolean errorShown;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Le site sait qu'il tourne dans l'app (pas de bouton « Télécharger l'app »).
        settings.setUserAgentString(settings.getUserAgentString() + " NewMannheimApp");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);  // captcha Turnstile
        webView.setWebViewClient(new Client());
        webView.addJavascriptInterface(new Bridge(), "NewMannheimApp");
        setContentView(webView);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (serverUrl().isEmpty()) {
            askServerUrl(false);
        } else {
            webView.loadUrl(serverUrl());
        }
    }

    private String serverUrl() {
        return prefs.getString(SERVER_URL, "");
    }

    /** « 192.168.1.10:8080 » -> « http://192.168.1.10:8080 », sans barre finale. */
    private static String normalize(String input) {
        String url = input.trim();
        if (url.isEmpty()) return url;
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    private void askServerUrl(boolean cancelable) {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint(R.string.server_hint);
        String current = serverUrl().isEmpty() ? getString(R.string.default_server_url) : serverUrl();
        input.setText(current);
        input.setSelection(input.getText().length());
        FrameLayout box = new FrameLayout(this);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(input);

        AlertDialog.Builder dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.server_title)
                .setMessage(R.string.server_message)
                .setView(box)
                .setCancelable(cancelable)
                .setPositiveButton(R.string.connect, (d, w) -> {
                    String url = normalize(input.getText().toString());
                    if (url.isEmpty()) {
                        askServerUrl(cancelable);
                        return;
                    }
                    prefs.edit().putString(SERVER_URL, url).apply();
                    errorShown = false;
                    webView.clearHistory();
                    webView.loadUrl(url);
                });
        if (cancelable) dialog.setNegativeButton(android.R.string.cancel, null);
        else dialog.setNegativeButton(R.string.quit, (d, w) -> finish());
        dialog.show();
    }

    private boolean sameServer(Uri uri) {
        Uri server = Uri.parse(serverUrl());
        return uri.getHost() != null && uri.getHost().equals(server.getHost()) && uri.getPort() == server.getPort();
    }

    /** Appelé par le site (thread JavaScript) : imprime la page affichée, en A4 comme le prévoit son CSS. */
    private class Bridge {
        @JavascriptInterface
        public void print(String title) {
            runOnUiThread(() -> {
                PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                printManager.print(title, webView.createPrintDocumentAdapter(title),
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (sameServer(uri) || !request.isForMainFrame()) return false;
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            errorShown = false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame() || errorShown || isFinishing()) return;
            errorShown = true;
            new AlertDialog.Builder(MainActivity.this)
                    .setTitle(R.string.unreachable_title)
                    .setMessage(getString(R.string.unreachable_message, serverUrl(), error.getDescription()))
                    .setCancelable(false)
                    .setPositiveButton(R.string.retry, (d, w) -> webView.loadUrl(serverUrl()))
                    .setNeutralButton(R.string.change_server, (d, w) -> askServerUrl(false))
                    .show();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle(R.string.app_name)
                .setPositiveButton(R.string.quit, (d, w) -> finish())
                .setNeutralButton(R.string.change_server, (d, w) -> askServerUrl(true))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();  // rester connecté si Android ferme l'app
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
