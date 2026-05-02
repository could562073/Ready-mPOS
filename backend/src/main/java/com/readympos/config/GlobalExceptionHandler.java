package com.readympos.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// 全域例外處理：將已知的業務例外轉為適當的 HTTP 狀態碼
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 請求參數格式錯誤（如 month 格式不符）→ 400
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setDetail(ex.getMessage());
        return pd;
    }

    // Bean Validation 失敗 → 400（Spring 預設也會處理，但加上這裡可統一格式）
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setDetail(ex.getBindingResult().getAllErrors().get(0).getDefaultMessage());
        return pd;
    }
}
