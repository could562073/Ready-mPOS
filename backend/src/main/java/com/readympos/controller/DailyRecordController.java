package com.readympos.controller;

import com.readympos.dto.DailyRecordDto;
import com.readympos.service.DailyRecordService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@RestController
@RequestMapping("/api/records")
@RequiredArgsConstructor
public class DailyRecordController {

    private final DailyRecordService service;

    // GET /api/records?month=YYYY-MM — 月結報表資料
    @GetMapping
    public List<DailyRecordDto.Response> getByMonth(@RequestParam String month) {
        try {
            return service.getMonthlyRecords(YearMonth.parse(month));
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Invalid month format, expected YYYY-MM");
        }
    }

    // GET /api/records/{date} — 查詢單日帳目
    @GetMapping("/{date}")
    public ResponseEntity<DailyRecordDto.Response> getByDate(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.getByDate(date)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    // POST /api/records — 前端離線資料同步上來（新增）
    @PostMapping
    public ResponseEntity<DailyRecordDto.Response> create(
            @Valid @RequestBody DailyRecordDto.Request req) {
        DailyRecordDto.Response created = service.create(req);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
            .path("/{date}")
            .buildAndExpand(created.date())
            .toUri();
        return ResponseEntity.created(location).body(created);
    }

    // PUT /api/records/{id} — 更新既有紀錄
    @PutMapping("/{id}")
    public DailyRecordDto.Response update(
            @PathVariable Long id,
            @Valid @RequestBody DailyRecordDto.Request req) {
        return service.update(id, req);
    }
}
