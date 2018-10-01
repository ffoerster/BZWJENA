<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaAngebote3 extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_angebote', function($table)
        {
            $table->string('angebot_subtitle')->change();
            $table->dropColumn('angebot_file');
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_angebote', function($table)
        {
            $table->string('angebot_subtitle', 191)->change();
            $table->text('angebot_file')->nullable();
        });
    }
}
