package com.readympos.service;

import com.readympos.dto.DailyRecordDto;
import com.readympos.model.DailyRecord;
import com.readympos.model.SyncStatus;
import com.readympos.repository.DailyRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class DailyRecordService {

    private final DailyRecordRepository repository;

    // 查詢指定月份的所有每日帳目，用於月結報表自動彙整
    public List<DailyRecordDto.Response> getMonthlyRecords(YearMonth month) {
        LocalDate start = month.atDay(1);
        LocalDate end = month.atEndOfMonth();
        return repository.findByDateBetweenOrderByDateAsc(start, end)
            .stream()
            .map(DailyRecordDto.Response::from)
            .toList();
    }

    // 查詢單日帳目（供前端載入既有紀錄填入表單）
    public Optional<DailyRecordDto.Response> getByDate(LocalDate date) {
        return repository.findByDate(date).map(DailyRecordDto.Response::from);
    }

    // 新增每日帳目：前端離線資料同步上來，標記為 SYNCED 確認入庫
    @Transactional
    public DailyRecordDto.Response create(DailyRecordDto.Request req) {
        DailyRecord record = new DailyRecord();
        applyFields(record, req);
        record.setSyncStatus(SyncStatus.SYNCED);
        return DailyRecordDto.Response.from(repository.save(record));
    }

    // 更新每日帳目：覆蓋現有紀錄並重設同步狀態為 SYNCED
    @Transactional
    public DailyRecordDto.Response update(Long id, DailyRecordDto.Request req) {
        DailyRecord record = repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Record not found: " + id));
        applyFields(record, req);
        record.setSyncStatus(SyncStatus.SYNCED);
        return DailyRecordDto.Response.from(repository.save(record));
    }

    private void applyFields(DailyRecord record, DailyRecordDto.Request req) {
        record.setDate(req.date());
        record.setCashIncome(req.cashIncome());
        record.setCardIncome(req.cardIncome());
        record.setUberEatsIncome(req.uberEatsIncome());
        record.setPandaIncome(req.pandaIncome());
        record.setFoodCost(req.foodCost());
        record.setStaffSalary(req.staffSalary());
        record.setMiscExpense(req.miscExpense());
        record.setNotes(req.notes());
    }
}
