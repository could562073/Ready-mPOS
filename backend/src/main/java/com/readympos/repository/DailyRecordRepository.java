package com.readympos.repository;

import com.readympos.model.DailyRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface DailyRecordRepository extends JpaRepository<DailyRecord, Long> {

    Optional<DailyRecord> findByDate(LocalDate date);

    // 月結查詢：依日期範圍取出並排序（用於月結報表）
    List<DailyRecord> findByDateBetweenOrderByDateAsc(LocalDate start, LocalDate end);
}
