# Outils pour compiler l'APK : JDK 17, Gradle, Android SDK. Le projet est monté au lancement (voir build.sh).
FROM gradle:8.10.2-jdk17

ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* \
    && mkdir -p $ANDROID_HOME/cmdline-tools \
    && curl -fsSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q /tmp/tools.zip -d $ANDROID_HOME/cmdline-tools && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
    && rm /tmp/tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools" > /dev/null

COPY build.sh /usr/local/bin/build-apk
CMD ["sh", "/usr/local/bin/build-apk"]
