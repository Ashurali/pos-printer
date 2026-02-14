# app/controllers/printer_settings_controller.rb
class PrinterSettingsController < ApplicationController
  before_action :set_printer_setting

  # GET /printer_settings
  def show
  end

  # PATCH /printer_settings
  def update
    if @printer_setting.update(printer_setting_params)
      respond_to do |format|
        format.html { redirect_to printer_settings_path, notice: 'Pengaturan printer berhasil disimpan.' }
        format.json { render json: @printer_setting.to_js_config }
        format.turbo_stream
      end
    else
      respond_to do |format|
        format.html { render :show, status: :unprocessable_entity }
        format.json { render json: { errors: @printer_setting.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  # GET /printer_settings/config.json
  def config
    render json: @printer_setting.to_js_config
  end

  private

  def set_printer_setting
    @printer_setting = PrinterSetting.for_user(current_user_if_available)
  end

  def printer_setting_params
    params.require(:printer_setting).permit(
      :device_name, :device_id, :paper_width,
      :auto_reconnect, :chunk_size, :chunk_delay,
      :cash_drawer_pin
    )
  end

  # Helper if your app doesn't use authentication yet.
  def current_user_if_available
    respond_to?(:current_user) ? current_user : nil
  end
end
