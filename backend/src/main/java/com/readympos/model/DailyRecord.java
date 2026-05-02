package com.readympos.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

// 每日帳目實體，對應手寫一張日結單
@Entity
@Table(name = "daily_records",
       uniqueConstraints = @UniqueConstraint(name = "uq_daily_records_date", columnNames = "date"))
@Getter
@Setter
@NoArgsConstructor
public class DailyRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 每日唯一，格式 YYYY-MM-DD（資料庫層級保證不重複）
    @Column(nullable = false, unique = true)
    private LocalDate date;

    // 每日收入欄位（台幣整數，精度 12 位不含小數）
    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal cashIncome = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal cardIncome = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal uberEatsIncome = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal pandaIncome = BigDecimal.ZERO;

    // 每日支出欄位
    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal foodCost = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal staffSalary = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 0)
    private BigDecimal miscExpense = BigDecimal.ZERO;

    @Column(columnDefinition = "TEXT")
    private String notes;

    // 離線同步狀態：後端收到前端資料後標記為 SYNCED
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private SyncStatus syncStatus = SyncStatus.PENDING;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
