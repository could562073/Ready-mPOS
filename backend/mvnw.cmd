@REM Maven Wrapper startup batch script, version 3.3.2
@IF "%MAVEN_BATCH_ECHO%"=="on"  ECHO ON
@IF "%HOME%"=="" (SET "HOME=%HOMEDRIVE%%HOMEPATH%")
@SET ERROR_CODE=0
@SETLOCAL

@IF NOT "%JAVA_HOME%"=="" GOTO OkJHome
@ECHO Error: JAVA_HOME is not set. >&2
@GOTO error
:OkJHome
@IF NOT EXIST "%JAVA_HOME%\bin\java.exe" (
  @ECHO Error: JAVA_HOME is set to an invalid directory: %JAVA_HOME% >&2
  @GOTO error
)

@SET "MAVEN_PROJECTBASEDIR=%~dp0"
@SET "WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar"
@SET "DOWNLOAD_URL=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar"
@SET "WRAPPER_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain"

@IF EXIST "%WRAPPER_JAR%" GOTO runMaven

@ECHO Downloading Maven Wrapper...
@powershell -Command "(New-Object Net.WebClient).DownloadFile('%DOWNLOAD_URL%', '%WRAPPER_JAR%')"
@IF ERRORLEVEL 1 (
  @ECHO Failed to download maven-wrapper.jar >&2
  @GOTO error
)

:runMaven
"%JAVA_HOME%\bin\java.exe" ^
  %MAVEN_OPTS% %MAVEN_DEBUG_OPTS% ^
  -classpath "%WRAPPER_JAR%" ^
  "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR%" ^
  %WRAPPER_LAUNCHER% %*

@IF ERRORLEVEL 1 GOTO error
@GOTO end

:error
@SET ERROR_CODE=1
:end
@ENDLOCAL & SET ERROR_CODE=%ERROR_CODE%
@EXIT /B %ERROR_CODE%
