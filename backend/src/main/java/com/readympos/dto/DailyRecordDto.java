package com.readympos.dto;

import com.readympos.model.DailyRecord;
import com.readympos.model.SyncStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class DailyRecordDto {

    public record Request(
        @NotNull @PastOrPresent LocalDate date,
        @NotNull @PositiveOrZero BigDecimal cashIncome,
        @NotNull @PositiveOrZero BigDecimal cardIncome,
        @NotNull @PositiveOrZero BigDecimal uberEatsIncome,
        @NotNull @PositiveOrZero BigDecimal pandaIncome,
        @NotNull @PositiveOrZero BigDecimal foodCost,
        @NotNull @PositiveOrZero BigDecimal staffSalary,
        @NotNull @PositiveOrZero BigDecimal miscExpense,
        String notes
    ) {}

    public record Response(
        Long id,
        LocalDate date,
        BigDecimal cashIncome,
        BigDecimal cardIncome,
        BigDecimal uberEatsIncome,
        BigDecimal pandaIncome,
        BigDecimal foodCost,
        BigDecimal staffSalary,
        BigDecimal miscExpense,
        String notes,
        SyncStatus syncStatus,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
    ) {
        public static Response from(DailyRecord r) {
            return new Response(
                r.getId(), r.getDate(),
                r.getCashIncome(), r.getCardIncome(),
                r.getUberEatsIncome(), r.getPandaIncome(),
                r.getFoodCost(), r.getStaffSalary(), r.getMiscExpense(),
                r.getNotes(), r.getSyncStatus(),
                r.getCreatedAt(), r.getUpdatedAt()
            );
        }
    }
}
